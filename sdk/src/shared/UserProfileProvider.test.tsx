import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DWELL_SECONDS_STORAGE_KEY, UserProfileProvider, useUserProfile } from "@/src/shared/UserProfileProvider";
import { commonPointOfInterestSubtypeList } from "@/src/shared/poiSubtypes";

const wrapper = ({ children }: { children: React.ReactNode }) => <UserProfileProvider>{children}</UserProfileProvider>;

// Awaiting the render lets the provider's asynchronous load from storage settle inside act(), so the
// profile is in its final state (seeded, or restored from storage) before any assertion runs.
const renderProfile = async () => {
  const rendered = renderHook(() => useUserProfile(), { wrapper });
  await act(async () => {});
  return rendered;
};

describe("UserProfileProvider", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test("seeds every curated subtype ordered by descending priority", async () => {
    const { result } = await renderProfile();
    const ordered = result.current.orderedSubtypes();
    expect(ordered).toHaveLength(commonPointOfInterestSubtypeList.length);
    expect(ordered[0]).toBe(commonPointOfInterestSubtypeList[0]);
  });

  test("gaze dwell raises a subtype's priority so it climbs the ranking", async () => {
    const { result } = await renderProfile();
    const last = result.current.orderedSubtypes().at(-1)!;

    act(() => result.current.addDwellSeconds(last, commonPointOfInterestSubtypeList.length + 5));

    expect(result.current.orderedSubtypes()[0]).toBe(last);
  });

  test("adds gaze dwell on top of the seeded default", async () => {
    const { result } = await renderProfile();
    const subtype = result.current.orderedSubtypes()[0]!;
    const seeded = result.current.dwellSecondsOf(subtype);

    act(() => result.current.addDwellSeconds(subtype, 3));
    act(() => result.current.addDwellSeconds(subtype, 2));

    expect(result.current.dwellSecondsOf(subtype)).toBe(seeded + 5);
  });

  test("seeds the shown dwell time in descending order so the top type has the most", async () => {
    const { result } = await renderProfile();
    const ordered = result.current.orderedSubtypes();
    expect(result.current.dwellSecondsOf(ordered[0]!)).toBeGreaterThan(result.current.dwellSecondsOf(ordered.at(-1)!));
  });

  test("moveUp swaps a subtype with the one above it", async () => {
    const { result } = await renderProfile();
    const [first, second] = result.current.orderedSubtypes();

    act(() => result.current.moveUp(second!));

    const reordered = result.current.orderedSubtypes();
    expect(reordered[0]).toBe(second);
    expect(reordered[1]).toBe(first);
  });

  test("moveUp on the top subtype is a no-op", async () => {
    const { result } = await renderProfile();
    const before = result.current.orderedSubtypes();

    act(() => result.current.moveUp(before[0]!));

    expect(result.current.orderedSubtypes()).toEqual(before);
  });

  test("registerSubtypes adds unseen subtypes at the bottom", async () => {
    const { result } = await renderProfile();

    act(() => result.current.registerSubtypes(["a_brand_new_subtype"]));

    const ordered = result.current.orderedSubtypes();
    expect(ordered).toContain("a_brand_new_subtype");
    expect(ordered.at(-1)).toBe("a_brand_new_subtype");
  });

  test("reset restores the seeded defaults after preferences change", async () => {
    const { result } = await renderProfile();
    const seededTop = result.current.orderedSubtypes()[0]!;
    const seededBottom = result.current.orderedSubtypes().at(-1)!;

    act(() => result.current.addDwellSeconds(seededBottom, commonPointOfInterestSubtypeList.length + 5));
    expect(result.current.orderedSubtypes()[0]).toBe(seededBottom);

    act(() => result.current.reset());

    expect(result.current.orderedSubtypes()[0]).toBe(seededTop);
  });

  test("restores a stored preference on a fresh mount", async () => {
    const lowestPriorityByDefault = commonPointOfInterestSubtypeList.at(-1)!;
    await AsyncStorage.setItem(DWELL_SECONDS_STORAGE_KEY, JSON.stringify({ [lowestPriorityByDefault]: 10_000 }));

    const { result } = await renderProfile();

    expect(result.current.orderedSubtypes()[0]).toBe(lowestPriorityByDefault);
  });
});
