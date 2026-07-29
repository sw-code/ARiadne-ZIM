import { useEffect } from "react";
import Constants from "expo-constants";
import { LocationObjectCoords } from "expo-location";
import type { NavigationMode } from "@/App";
import { placesPausedAt, summariseWalk, WalkSample, WalkSummary } from "@/src/3d/walkRecording";
import type { WalkCounts, WalkEncounters } from "@/src/3d/walkEncounters";
import { geoCoordsFromGPS } from "@/src/shared/GeoLocation";
import { languageOfLocale, localIsoDate } from "@/src/shared/JavascriptExtensions";
import { PointOfInterest } from "@/src/shared/poi";
import { currentAbsoluteTime, useLatest, useRefLazy } from "@/src/shared/ReactExtensions";
import { useUserProfile } from "@/src/shared/UserProfileProvider";
import { sendWalkReport, walkReportConsentVersion, WalkReportRequest } from "@/src/shared/WalkReportService";

type WalkRecordingArgs = {
  location: LocationObjectCoords | null;
  isArTracking: boolean;
  pois: PointOfInterest[]; // the places shown in AR
  encounters: WalkEncounters;
  navigationMode: NavigationMode;
};

// Shorter sessions are a look around or a restart of AR rather than a walk; they would only add noise.
const minRecordedWalkMinutes = 1;

/// Samples the walk on every GPS update. On leaving AR, engages the places paused at, records the walking speed and, if
/// the user shares walk reports, sends one.
export function useWalkRecording(args: WalkRecordingArgs): void {
  const profile = useUserProfile();
  const latest = useLatest({ ...args, profile });
  const samples = useRefLazy<WalkSample[]>(() => []).current;
  const { location } = args;

  useEffect(() => {
    if (location) samples.push(walkSampleOf(location, latest.current.isArTracking));
  }, [location, samples, latest]);

  useEffect(
    () => () => {
      const { pois, encounters, navigationMode, profile } = latest.current;
      // Fixes are requested every metre, so there may be none for a while before AR is left, e.g. while standing at the
      // destination. The walk lasts until AR is left, which keeps that time in it and lets a stop there become a pause.
      const summary = summariseWalk(samples, currentAbsoluteTime().nowSeconds);
      if (summary.durationMinutes < minRecordedWalkMinutes) return;

      for (const place of placesPausedAt(summary.pauses, pois)) encounters.engaged(place);
      if (summary.medianSpeedMetresPerSecond !== null) profile.recordWalkSpeed(summary.medianSpeedMetresPerSecond);
      if (profile.isWalkReportSharingEnabled) {
        void sendWalkReport(walkReportOf(summary, encounters.tally(), navigationMode, profile.installId));
      }
    },
    [samples, latest],
  );
}

function walkSampleOf(location: LocationObjectCoords, isArTracking: boolean): WalkSample {
  return {
    atSeconds: currentAbsoluteTime().nowSeconds,
    coordinate: geoCoordsFromGPS(location),
    // iOS reports -1 when it does not know the speed.
    speedMetresPerSecond: location.speed !== null && location.speed >= 0 ? location.speed : null,
    accuracyMetres: location.accuracy,
    isArTracking,
  };
}

// Only aggregates leave the phone: the pauses are counted, but where they were, like where the walk went, is not sent.
function walkReportOf(
  summary: WalkSummary,
  counts: WalkCounts,
  navigationMode: NavigationMode,
  installId: string,
): WalkReportRequest {
  return {
    installId,
    consentVersion: walkReportConsentVersion,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    walkedOn: localIsoDate(new Date()),
    mode: navigationMode,
    durationMinutes: summary.durationMinutes,
    medianSpeedMetresPerSecond: summary.medianSpeedMetresPerSecond,
    pauseCount: summary.pauses.length,
    arTrackingShare: summary.arTrackingShare,
    language: languageOfLocale(Intl.DateTimeFormat().resolvedOptions().locale),
    counts,
  };
}
