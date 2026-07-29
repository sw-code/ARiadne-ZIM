import { distanceMetres, GeoCoordinate } from "@/src/shared/GeoLocation";
import { findMinimumBy, startingAtFirst, sum } from "@/src/shared/JavascriptExtensions";
import { median } from "@/src/shared/math";
import { PointOfInterest } from "@/src/shared/poi";

export type WalkSample = {
  atSeconds: number;
  coordinate: GeoCoordinate;
  speedMetresPerSecond: number | null; // null when the device does not know it
  accuracyMetres: number | null; // the radius of uncertainty the device reports; null when it does not know it
  isArTracking: boolean;
};
export type Pause = { coordinate: GeoCoordinate; durationSeconds: number };
export type WalkSummary = {
  durationMinutes: number;
  medianSpeedMetresPerSecond: number | null; // null without movement measured by accurate fixes
  pauses: Pause[];
  arTrackingShare: number; // 0–1, share of the walk's time during which AR tracked
};

// Slower than this, someone is standing, e.g. in front of a shop window, rather than strolling.
const standingSpeedMetresPerSecond = 0.3;
// GPS jitter makes a phone that stands still, e.g. indoors, report walking speeds: on the device, standing indoors gave a
// median of 1.58 m/s. Under a clear sky fixes are usually accurate to well below this, so less accurate fixes, and those
// of unknown accuracy, do not count toward the walking speed. Pauses still use every fix.
const maxSpeedFixAccuracyMetres = 20;
// Shorter stops are traffic lights, crowds or a glance at the phone rather than interest in a place.
const minPauseSeconds = 20;
const pauseEngagementRadiusMetres = 20;

// A fix and the time it stands for: until the next fix arrives, or for the last one, until the walk ended.
type Interval = { fix: WalkSample; endSeconds: number; isStanding: boolean };

// GPS fixes do not arrive at a fixed rate, so each one is weighted by the time it stands for.
export function summariseWalk(fixes: WalkSample[], endedAtSeconds: number): WalkSummary {
  const intervals = intervalsOf(fixes, endedAtSeconds);
  const durationSeconds = sum(intervals.map(secondsOf));
  const arTrackingSeconds = sum(intervals.filter(({ fix }) => fix.isArTracking).map(secondsOf));
  const walkingSpeeds = fixes
    .filter(isAccurateEnoughForSpeed)
    .map((fix) => fix.speedMetresPerSecond)
    .filter((speed): speed is number => speed !== null && speed >= standingSpeedMetresPerSecond);

  return {
    durationMinutes: durationSeconds / 60,
    medianSpeedMetresPerSecond: median(walkingSpeeds) ?? null,
    // Standing while AR initialises is waiting for the app, not interest in the place nearby.
    pauses: pausesIn(startingAtFirst(intervals, ({ fix }) => fix.isArTracking)),
    arTrackingShare: durationSeconds > 0 ? arTrackingSeconds / durationSeconds : 0,
  };
}

// No fix follows the last one, so how far the phone moved after it is unknown and only its reported speed tells
// whether someone stood. Judged by the distance, a session with a single fix or fixes that stop arriving at the end of
// a walk, e.g. in a GPS dropout, would turn into a pause.
function intervalsOf(fixes: WalkSample[], endedAtSeconds: number): Interval[] {
  return fixes.map((fix, index) => {
    const next = fixes[index + 1];
    return next
      ? { fix, endSeconds: next.atSeconds, isStanding: isStandingBetween(fix, next) }
      : { fix, endSeconds: endedAtSeconds, isStanding: isReportedStanding(fix) };
  });
}

function isAccurateEnoughForSpeed({ accuracyMetres }: WalkSample): boolean {
  return accuracyMetres !== null && accuracyMetres <= maxSpeedFixAccuracyMetres;
}

function secondsOf({ fix, endSeconds }: Interval): number {
  return endSeconds - fix.atSeconds;
}

/// Per pause, the nearest place within 20 m of where it began, if there is one.
export function placesPausedAt(pauses: Pause[], pois: PointOfInterest[]): PointOfInterest[] {
  return pauses.flatMap(({ coordinate }) => {
    const distanceTo = (poi: PointOfInterest) => distanceMetres(coordinate, poi.location.coordinate);
    const nearest = findMinimumBy(pois, distanceTo);
    return nearest && distanceTo(nearest) <= pauseEngagementRadiusMetres ? [nearest] : [];
  });
}

// A stop lasts from the fix where someone started standing until the fix where they walk on, or until the walk ends.
function pausesIn(intervals: Interval[]): Pause[] {
  const stops: Pause[] = [];
  let stopStart: WalkSample | null = null;

  for (const { fix, isStanding } of intervals) {
    if (isStanding) {
      stopStart ??= fix;
    } else if (stopStart) {
      stops.push(stopBetween(stopStart, fix.atSeconds));
      stopStart = null;
    }
  }
  const last = intervals.at(-1);
  if (stopStart && last) stops.push(stopBetween(stopStart, last.endSeconds));

  return stops.filter((stop) => stop.durationSeconds >= minPauseSeconds);
}

// The distance covered catches stops the reported speed misses: fixes are requested every metre, so after stopping
// there may be none until walking on, and the last one before the stop still carries walking speed. Fixes that arrive
// regularly while walking cover more than 0.3 m/s anyway, so this only tells across gaps.
function isStandingBetween(fix: WalkSample, next: WalkSample): boolean {
  const coveredMetresPerSecond = distanceMetres(fix.coordinate, next.coordinate) / (next.atSeconds - fix.atSeconds);
  return isReportedStanding(fix) || coveredMetresPerSecond < standingSpeedMetresPerSecond;
}

function isReportedStanding({ speedMetresPerSecond }: WalkSample): boolean {
  return speedMetresPerSecond !== null && speedMetresPerSecond < standingSpeedMetresPerSecond;
}

function stopBetween(start: WalkSample, endSeconds: number): Pause {
  return { coordinate: start.coordinate, durationSeconds: endSeconds - start.atSeconds };
}
