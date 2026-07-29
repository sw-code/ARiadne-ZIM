import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationObjectCoords } from "expo-location";
import { SETTINGS_STORAGE_KEY, UserProfileProvider, useUserProfile } from "@/src/shared/UserProfileProvider";
import { commonPointOfInterestSubtypeList, isSensitiveSubtype } from "@/src/shared/poiSubtypes";
import { deleteWalkReports, sendWalkReport } from "@/src/shared/WalkReportService";
import { useWalkRecording } from "@/src/3d/useWalkRecording";
import { createWalkEncounters } from "@/src/3d/walkEncounters";

jest.mock("@/src/shared/WalkReportService", () => ({
  deleteWalkReports: jest.fn(() => Promise.resolve()),
  sendWalkReport: jest.fn(() => Promise.resolve()),
}));

type ProviderOptions = { offersWalkReportSharing?: boolean };

function wrapperWith(options: ProviderOptions) {
  return function ProfileWrapper({ children }: { children: React.ReactNode }) {
    return <UserProfileProvider {...options}>{children}</UserProfileProvider>;
  };
}
const wrapper = wrapperWith({});

// Awaiting the render lets the provider's asynchronous load from storage settle inside act(), so the
// profile is in its final state (fresh, or restored from storage) before any assertion runs.
const renderProfile = async (options: ProviderOptions = {}) => {
  const rendered = renderHook(() => useUserProfile(), { wrapper: wrapperWith(options) });
  await act(async () => {});
  return rendered;
};

const offeringSharing: ProviderOptions = { offersWalkReportSharing: true };

const cafe = { category: "amenity", subtype: "cafe" } as const;
const bakery = { category: "shop", subtype: "bakery" } as const;

describe("UserProfileProvider", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test("a fresh profile lists the curated subtypes in curated order, without sensitive ones", async () => {
    const { result } = await renderProfile();

    const expected = commonPointOfInterestSubtypeList.filter((subtype) => !isSensitiveSubtype(subtype));
    expect(result.current.listedSubtypes()).toEqual(expected);
    expect(result.current.listedSubtypes()).not.toContain("pharmacy");
  });

  test("a fresh profile has counted nothing", async () => {
    const { result } = await renderProfile();

    expect(result.current.countsOf("cafe")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.allCounts()).toEqual({});
  });

  test("recordShown and recordEngaged count per subtype", async () => {
    const { result } = await renderProfile();

    act(() => result.current.recordShown(cafe));
    act(() => result.current.recordShown(cafe));
    act(() => result.current.recordEngaged(cafe));

    expect(result.current.countsOf("cafe")).toEqual({ shown: 2, engaged: 1 });
  });

  test("sensitive kinds are never counted", async () => {
    const { result } = await renderProfile();

    act(() => result.current.recordShown({ category: "healthcare", subtype: "psychotherapist" }));
    act(() => result.current.recordEngaged({ category: "healthcare", subtype: "psychotherapist" }));
    act(() => result.current.recordShown({ category: "healthcare", subtype: "midwife" }));
    act(() => result.current.recordShown({ category: "amenity", subtype: "place_of_worship" }));

    expect(result.current.countsOf("psychotherapist")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.countsOf("midwife")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.countsOf("place_of_worship")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.allCounts()).toEqual({});
  });

  test("engaged never exceeds shown", async () => {
    const { result } = await renderProfile();

    act(() => result.current.recordEngaged(cafe));
    act(() => result.current.recordEngaged(cafe));

    expect(result.current.countsOf("cafe")).toEqual({ shown: 2, engaged: 2 });
  });

  test("chosen-more types lead, chosen-less types trail, the rest sort by engaged share", async () => {
    const { result } = await renderProfile();
    const curatedOrder = result.current.listedSubtypes();

    act(() => result.current.recordShown(cafe));
    act(() => result.current.recordShown(bakery));
    act(() => result.current.recordEngaged(bakery));
    act(() => result.current.setChoice("tailor", "more"));
    act(() => result.current.setChoice("restaurant", "less"));

    const listed = result.current.listedSubtypes();
    const neutral = curatedOrder.filter((subtype) => subtype !== "tailor" && subtype !== "restaurant");
    expect(listed[0]).toBe("tailor");
    expect(listed.at(-1)).toBe("restaurant");
    expect(listed.slice(1, -1)).toEqual(["bakery", ...neutral.filter((subtype) => subtype !== "bakery")]);
  });

  test("a subtype seen only at runtime is listed after the curated ones", async () => {
    const { result } = await renderProfile();

    act(() => result.current.recordShown({ category: "amenity", subtype: "a_brand_new_subtype" }));

    expect(result.current.listedSubtypes().at(-1)).toBe("a_brand_new_subtype");
  });

  test("choosing Auto clears the choice", async () => {
    const { result } = await renderProfile();

    act(() => result.current.setChoice("cafe", "more"));
    expect(result.current.countsOf("cafe").choice).toBe("more");

    act(() => result.current.setChoice("cafe", null));
    expect(result.current.countsOf("cafe")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.countsOf("cafe")).not.toHaveProperty("choice");
  });

  test("profileForRanking is null while personalisation is off", async () => {
    const { result } = await renderProfile();
    act(() => result.current.recordShown(cafe));
    expect(result.current.isPersonalisationEnabled).toBe(true);
    expect(result.current.profileForRanking()).toEqual({ cafe: { shown: 1, engaged: 0 } });

    act(() => result.current.setPersonalisationEnabled(false));

    expect(result.current.profileForRanking()).toBeNull();
  });

  test("profileForRanking is null until the stored settings have loaded", async () => {
    // Personalisation is on by default, so answering before the stored switch arrives could send the profile of
    // someone who switched it off.
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    expect(result.current.profileForRanking()).toBeNull();

    await act(async () => {});

    expect(result.current.profileForRanking()).toEqual({});
  });

  test("sharing walk reports is off until the user switches it on", async () => {
    const { result } = await renderProfile(offeringSharing);
    expect(result.current.isWalkReportSharingEnabled).toBe(false);

    act(() => result.current.setWalkReportSharingEnabled(true));

    expect(result.current.isWalkReportSharingEnabled).toBe(true);
  });

  test("counts and choices survive a remount", async () => {
    const first = await renderProfile();
    act(() => first.result.current.recordShown(cafe));
    act(() => first.result.current.recordEngaged(cafe));
    act(() => first.result.current.setChoice("bakery", "more"));
    first.unmount();

    const { result } = await renderProfile();

    expect(result.current.countsOf("cafe")).toEqual({ shown: 1, engaged: 1 });
    expect(result.current.countsOf("bakery").choice).toBe("more");
  });

  test("the install id and the switches survive a remount", async () => {
    const first = await renderProfile(offeringSharing);
    act(() => first.result.current.setPersonalisationEnabled(false));
    act(() => first.result.current.setWalkReportSharingEnabled(true));
    const installId = first.result.current.installId;
    first.unmount();

    const { result } = await renderProfile(offeringSharing);

    expect(result.current.installId).toBe(installId);
    expect(result.current.isPersonalisationEnabled).toBe(false);
    expect(result.current.isWalkReportSharingEnabled).toBe(true);
  });

  test("reset clears counts and choices and issues a new install id", async () => {
    const { result } = await renderProfile();
    act(() => result.current.recordShown(cafe));
    act(() => result.current.setChoice("bakery", "less"));
    act(() => result.current.recordWalkSpeed(1.0));
    const oldInstallId = result.current.installId;

    act(() => result.current.reset());

    expect(result.current.allCounts()).toEqual({});
    expect(result.current.countsOf("bakery")).toEqual({ shown: 0, engaged: 0 });
    expect(result.current.walkingSpeedMetresPerSecond()).toBe(1.3);
    expect(result.current.installId).not.toBe(oldInstallId);
  });

  test("reset asks the CMS to delete the old install's reports", async () => {
    const first = await renderProfile();
    const storedInstallId = first.result.current.installId;
    first.unmount();
    const { result } = await renderProfile();

    act(() => result.current.reset());

    expect(deleteWalkReports).toHaveBeenCalledTimes(1);
    expect(deleteWalkReports).toHaveBeenCalledWith(storedInstallId);
    expect(result.current.installId).not.toBe(storedInstallId);
  });

  test("reset keeps the privacy switches where the user put them", async () => {
    const { result } = await renderProfile(offeringSharing);
    act(() => result.current.setPersonalisationEnabled(false));
    act(() => result.current.setWalkReportSharingEnabled(true));

    act(() => result.current.reset());

    expect(result.current.isPersonalisationEnabled).toBe(false);
    expect(result.current.isWalkReportSharingEnabled).toBe(true);
  });

  test("walking speed is the median of the last 10 walks, 1.3 m/s before the first", async () => {
    const { result } = await renderProfile();
    expect(result.current.walkingSpeedMetresPerSecond()).toBe(1.3);

    const olderFastWalksThatNoLongerCount = [9, 9, 9, 9];
    const lastTenWalks = [2, 2, 2, 2, 2, 2, 2, 9, 9, 9];
    for (const speed of [...olderFastWalksThatNoLongerCount, ...lastTenWalks]) {
      act(() => result.current.recordWalkSpeed(speed));
    }

    expect(result.current.walkingSpeedMetresPerSecond()).toBe(2);
  });

  test("a walking speed that is not finite and positive is ignored", async () => {
    const { result } = await renderProfile();

    for (const speed of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1.2]) {
      act(() => result.current.recordWalkSpeed(speed));
    }
    expect(result.current.walkingSpeedMetresPerSecond()).toBe(1.3);

    act(() => result.current.recordWalkSpeed(1.1));
    expect(result.current.walkingSpeedMetresPerSecond()).toBe(1.1);
  });

  test("the settings count as loaded once the stored ones have arrived", async () => {
    const { result } = renderHook(() => useUserProfile(), { wrapper });
    expect(result.current.areSettingsLoaded).toBe(false);

    await act(async () => {});

    expect(result.current.areSettingsLoaded).toBe(true);
  });

  test("the old dwell-seconds record is removed from storage", async () => {
    await AsyncStorage.setItem("userProfile.dwellSeconds", JSON.stringify({ cafe: 12 }));

    await renderProfile();

    expect(await AsyncStorage.getItem("userProfile.dwellSeconds")).toBeNull();
  });
});

// Walk reports may only be sent once the data protection officer has signed off; until then the app does not offer
// sharing.
describe("walk-report sharing while it is not offered", () => {
  const sharingSwitchedOn = { isWalkReportSharingEnabled: true };
  const walkStartMillis = new Date("2026-10-22T10:00:00").getTime();

  const locationAt = (latitude: number): LocationObjectCoords => ({
    latitude,
    longitude: 8.1055,
    altitude: 0,
    accuracy: 4,
    altitudeAccuracy: null,
    heading: null,
    speed: 1.2,
  });

  // Two fixes 65 s and about 80 m apart, then AR is left: a walk long enough to be reported.
  async function walkWith(options: ProviderOptions) {
    const encounters = createWalkEncounters({ recordShown: jest.fn(), recordEngaged: jest.fn() });
    const walkProps = (location: LocationObjectCoords | null) => ({
      location,
      isArTracking: true,
      pois: [],
      encounters,
      navigationMode: "explore" as const,
    });
    const now = jest.spyOn(Date, "now").mockReturnValue(walkStartMillis);
    const { rerender, unmount } = renderHook(
      (props: Parameters<typeof useWalkRecording>[0]) => useWalkRecording(props),
      {
        wrapper: wrapperWith(options),
        initialProps: walkProps(null),
      },
    );
    await act(async () => {});
    rerender(walkProps(locationAt(51.5715)));
    now.mockReturnValue(walkStartMillis + 65_000);
    rerender(walkProps(locationAt(51.5722)));
    unmount();
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sharingSwitchedOn));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("the stored setting reads as off", async () => {
    const { result } = await renderProfile();

    expect(result.current.isWalkReportSharingOffered).toBe(false);
    expect(result.current.isWalkReportSharingEnabled).toBe(false);
  });

  test("no walk report is sent, even with the stored setting on", async () => {
    await walkWith({});

    expect(sendWalkReport).not.toHaveBeenCalled();
  });

  test("once sharing is offered, the stored setting sends the report", async () => {
    await walkWith(offeringSharing);

    expect(sendWalkReport).toHaveBeenCalledTimes(1);
  });
});
