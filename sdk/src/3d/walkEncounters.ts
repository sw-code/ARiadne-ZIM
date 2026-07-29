import { PointOfInterest } from "@/src/shared/poi";
import { isSensitive } from "@/src/shared/poiSubtypes";
import type { UserProfile } from "@/src/shared/UserProfileProvider";

export type WalkCounts = Record<string, { shown: number; engaged: number }>; // keyed by place subtype

export type WalkEncounters = {
  shown: (poi: PointOfInterest) => void;
  engaged: (poi: PointOfInterest) => void; // implies shown
  tally: () => WalkCounts; // this walk only, sensitive kinds never present
};

// A place comes into view and out again many times during a walk, but it is one place. Counting it once
// per walk keeps a busy street from outweighing the rest of the walk in the profile and in the walk report.
// Sensitive kinds are dropped here as well, so the tally can be reported without a second filter.
export function createWalkEncounters(profile: Pick<UserProfile, "recordShown" | "recordEngaged">): WalkEncounters {
  const shownPlaceIds = new Set<string>();
  const engagedPlaceIds = new Set<string>();
  const countsBySubtype: WalkCounts = {};

  function shown(poi: PointOfInterest) {
    if (isSensitive(poi) || shownPlaceIds.has(poi.id)) return;
    shownPlaceIds.add(poi.id);
    countsOf(poi.subtype).shown += 1;
    profile.recordShown(poi);
  }

  function engaged(poi: PointOfInterest) {
    if (isSensitive(poi) || engagedPlaceIds.has(poi.id)) return;
    shown(poi);
    engagedPlaceIds.add(poi.id);
    countsOf(poi.subtype).engaged += 1;
    profile.recordEngaged(poi);
  }

  function countsOf(subtype: string) {
    return (countsBySubtype[subtype] ??= { shown: 0, engaged: 0 });
  }

  function tally(): WalkCounts {
    return Object.fromEntries(Object.entries(countsBySubtype).map(([subtype, counts]) => [subtype, { ...counts }]));
  }

  return { shown, engaged, tally };
}
