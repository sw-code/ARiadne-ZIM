import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { log } from "@/src/shared/Logger";
import { PointOfInterest } from "@/src/shared/poi";
import { commonPointOfInterestSubtypeList, isSensitive, isSensitiveSubtype } from "@/src/shared/poiSubtypes";
import { objectWithoutProperty } from "@/src/shared/JavascriptExtensions";
import { median } from "@/src/shared/math";
import { usePersistentState } from "@/src/shared/ReactExtensions";
import { deleteWalkReports } from "@/src/shared/WalkReportService";

// Counters instead of dwell seconds: how long someone walks changes dwell time but not how many of the
// places they saw they actually looked at, so counters stay comparable between users. The CMS turns
// them into an interest per subtype; the phone only counts, and keeps the explicit choice from Settings.

// Mirrors `InterestChoice`, `SubtypeCounts` and `InterestProfile` in cms/src/shared/api.ts. The packages
// cannot share code because Metro does not resolve files outside of sdk/.
export type InterestChoice = "more" | "less";
export type SubtypeCounts = { shown: number; engaged: number; choice?: InterestChoice };
export type InterestProfile = Record<string, SubtypeCounts>; // keyed by place subtype

export type PoiKind = Pick<PointOfInterest, "category" | "subtype">;

export type UserProfile = {
  countsOf: (subtype: string) => SubtypeCounts;
  allCounts: () => InterestProfile;
  listedSubtypes: () => string[]; // curated ∪ counted, minus sensitive; more, neutral, less; then engaged share
  recordShown: (poi: PoiKind) => void; // ignores sensitive kinds
  recordEngaged: (poi: PoiKind) => void; // ignores sensitive kinds; raises shown if engaged would exceed it
  setChoice: (subtype: string, choice: InterestChoice | null) => void;
  profileForRanking: () => InterestProfile | null; // null while personalisation is off or not yet loaded
  isPersonalisationEnabled: boolean;
  setPersonalisationEnabled: (isEnabled: boolean) => void;
  isWalkReportSharingOffered: boolean; // whether Settings shows the sharing switch
  isWalkReportSharingEnabled: boolean; // false while sharing is not offered, whatever is stored
  setWalkReportSharingEnabled: (isEnabled: boolean) => void;
  areSettingsLoaded: boolean; // the switches above show defaults until then
  installId: string; // Crypto.randomUUID(), renewed by reset
  walkingSpeedMetresPerSecond: () => number; // median of the last 10 walks, else 1.3
  recordWalkSpeed: (metresPerSecond: number) => void; // ignores speeds that are not finite and positive
  reset: () => void; // also asks the CMS to delete the walk reports filed under the old install id
};

export const COUNTS_STORAGE_KEY = "userProfile.counts";
export const SETTINGS_STORAGE_KEY = "userProfile.settings";
const LEGACY_DWELL_SECONDS_STORAGE_KEY = "userProfile.dwellSeconds";

// Open point of the design: whether personalisation starts switched on. Change it here only.
const isPersonalisationEnabledByDefault = true;
const isWalkReportSharingEnabledByDefault = false;

// Walk reports must not go live before the data protection officer has signed off the data protection impact
// assessment (DSFA), and merging deploys the CMS and builds the demo APK. Until then the switch is hidden and no
// report is sent, even if a stored setting says otherwise. Flip it once the sign-off is in.
const isWalkReportSharingOffered = false;

const defaultWalkingSpeedMetresPerSecond = 1.3;
const recentWalkCountForWalkingSpeed = 10;

type ProfileSettings = {
  installId: string;
  isPersonalisationEnabled: boolean;
  isWalkReportSharingEnabled: boolean;
  recentWalkSpeedsMetresPerSecond: number[];
};

function defaultSettings(): ProfileSettings {
  return {
    installId: Crypto.randomUUID(),
    isPersonalisationEnabled: isPersonalisationEnabledByDefault,
    isWalkReportSharingEnabled: isWalkReportSharingEnabledByDefault,
    recentWalkSpeedsMetresPerSecond: [],
  };
}

function countsFor(profile: InterestProfile, subtype: string): SubtypeCounts {
  return profile[subtype] ?? { shown: 0, engaged: 0 };
}

function withUpdatedCounts(
  profile: InterestProfile,
  subtype: string,
  update: (counts: SubtypeCounts) => SubtypeCounts,
): InterestProfile {
  return { ...profile, [subtype]: update(countsFor(profile, subtype)) };
}

function choiceRank({ choice }: SubtypeCounts): number {
  if (choice === "more") return 0;
  if (choice === "less") return 2;
  return 1;
}

function engagedShare({ shown, engaged }: SubtypeCounts): number {
  return shown === 0 ? 0 : engaged / shown;
}

// The sort is stable, so subtypes that tie keep their curated order, followed by those first counted at runtime.
function listSubtypes(profile: InterestProfile): string[] {
  const subtypes = [...new Set([...commonPointOfInterestSubtypeList, ...Object.keys(profile)])].filter(
    (subtype) => !isSensitiveSubtype(subtype),
  );
  return subtypes.sort((a, b) => {
    const countsOfA = countsFor(profile, a);
    const countsOfB = countsFor(profile, b);
    return choiceRank(countsOfA) - choiceRank(countsOfB) || engagedShare(countsOfB) - engagedShare(countsOfA);
  });
}

const UserProfileContext = createContext<UserProfile | null>(null);

type UserProfileProviderProps = {
  children: React.ReactNode;
  offersWalkReportSharing?: boolean; // for tests of sharing; the app goes by isWalkReportSharingOffered
};

export const UserProfileProvider: React.FC<UserProfileProviderProps> = ({
  children,
  offersWalkReportSharing = isWalkReportSharingOffered,
}) => {
  const [counts, setCounts] = usePersistentState<InterestProfile>(COUNTS_STORAGE_KEY, () => ({}));

  // Merging the stored settings over fresh defaults keeps what the user chose while giving settings
  // introduced after the profile was last saved their default (a lightweight forward migration).
  const [settings, setSettings, areSettingsLoaded] = usePersistentState<ProfileSettings>(
    SETTINGS_STORAGE_KEY,
    defaultSettings,
    (stored) => ({
      ...defaultSettings(),
      ...stored,
    }),
  );

  // Dwell seconds are dropped, not converted: they cannot be turned into counts.
  useEffect(() => {
    AsyncStorage.removeItem(LEGACY_DWELL_SECONDS_STORAGE_KEY).catch((error) =>
      log.warn("Could not remove the old dwell-seconds profile:", error),
    );
  }, []);

  const countsOf = useCallback((subtype: string) => countsFor(counts, subtype), [counts]);
  const allCounts = useCallback(() => counts, [counts]);
  const listedSubtypes = useCallback(() => listSubtypes(counts), [counts]);

  const recordShown = useCallback(
    (poi: PoiKind) => {
      if (isSensitive(poi)) return;
      setCounts((previous) =>
        withUpdatedCounts(previous, poi.subtype, (current) => ({ ...current, shown: current.shown + 1 })),
      );
    },
    [setCounts],
  );

  const recordEngaged = useCallback(
    (poi: PoiKind) => {
      if (isSensitive(poi)) return;
      setCounts((previous) =>
        withUpdatedCounts(previous, poi.subtype, (current) => {
          const engaged = current.engaged + 1;
          // Looking at a place implies having seen it, and a share above 1 would break the ranking.
          return { ...current, engaged, shown: Math.max(current.shown, engaged) };
        }),
      );
    },
    [setCounts],
  );

  const setChoice = useCallback(
    (subtype: string, choice: InterestChoice | null) => {
      setCounts((previous) =>
        withUpdatedCounts(previous, subtype, (current) =>
          choice === null ? objectWithoutProperty(current, "choice") : { ...current, choice },
        ),
      );
    },
    [setCounts],
  );

  // Until the stored switch has loaded, the default (on) is only a guess: answering with it could send the profile of
  // someone who opted out.
  const profileForRanking = useCallback(
    () => (areSettingsLoaded && settings.isPersonalisationEnabled ? counts : null),
    [areSettingsLoaded, settings.isPersonalisationEnabled, counts],
  );

  const setPersonalisationEnabled = useCallback(
    (isEnabled: boolean) => setSettings((previous) => ({ ...previous, isPersonalisationEnabled: isEnabled })),
    [setSettings],
  );

  const setWalkReportSharingEnabled = useCallback(
    (isEnabled: boolean) => setSettings((previous) => ({ ...previous, isWalkReportSharingEnabled: isEnabled })),
    [setSettings],
  );

  const walkingSpeedMetresPerSecond = useCallback(
    () => median(settings.recentWalkSpeedsMetresPerSecond) ?? defaultWalkingSpeedMetresPerSecond,
    [settings.recentWalkSpeedsMetresPerSecond],
  );

  // Guarded here rather than at the callers: a NaN breaks the sort inside the median, and a speed of 0 or below turns
  // every travel time infinite or negative, for the next 10 walks.
  const recordWalkSpeed = useCallback(
    (metresPerSecond: number) => {
      if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return;
      setSettings((previous) => ({
        ...previous,
        recentWalkSpeedsMetresPerSecond: [...previous.recentWalkSpeedsMetresPerSecond, metresPerSecond].slice(
          -recentWalkCountForWalkingSpeed,
        ),
      }));
    },
    [setSettings],
  );

  // Forgets what was learned (counts, choices, walking speed) and starts a new pseudonym. The privacy
  // switches stay: they are decisions of the user, not something learned about them.
  // The CMS files walk reports under the install id, so their deletion is requested while the old id is still known;
  // the id comes from state because storage lags behind by the write debounce. The deletion is best-effort and does
  // not hold up the reset: forgetting on the phone must work offline, and the CMS drops reports after a year anyway.
  const reset = useCallback(() => {
    void deleteWalkReports(settings.installId);
    const renewedInstallId = Crypto.randomUUID();
    setCounts({});
    setSettings((previous) => ({
      ...previous,
      installId: renewedInstallId,
      recentWalkSpeedsMetresPerSecond: [],
    }));
  }, [settings.installId, setCounts, setSettings]);

  const profile = useMemo<UserProfile>(
    () => ({
      countsOf,
      allCounts,
      listedSubtypes,
      recordShown,
      recordEngaged,
      setChoice,
      profileForRanking,
      isPersonalisationEnabled: settings.isPersonalisationEnabled,
      setPersonalisationEnabled,
      isWalkReportSharingOffered: offersWalkReportSharing,
      isWalkReportSharingEnabled: offersWalkReportSharing && settings.isWalkReportSharingEnabled,
      setWalkReportSharingEnabled,
      areSettingsLoaded,
      installId: settings.installId,
      walkingSpeedMetresPerSecond,
      recordWalkSpeed,
      reset,
    }),
    [
      countsOf,
      allCounts,
      listedSubtypes,
      recordShown,
      recordEngaged,
      setChoice,
      profileForRanking,
      settings.isPersonalisationEnabled,
      setPersonalisationEnabled,
      offersWalkReportSharing,
      settings.isWalkReportSharingEnabled,
      setWalkReportSharingEnabled,
      areSettingsLoaded,
      settings.installId,
      walkingSpeedMetresPerSecond,
      recordWalkSpeed,
      reset,
    ],
  );

  return <UserProfileContext.Provider value={profile}>{children}</UserProfileContext.Provider>;
};

export function useUserProfile(): UserProfile {
  const profile = useContext(UserProfileContext);
  if (!profile) {
    log.error("No UserProfile provided. Wrap your app in <UserProfileProvider>.");
    throw new Error("No UserProfile provided. Wrap your app in <UserProfileProvider>.");
  }
  return profile;
}
