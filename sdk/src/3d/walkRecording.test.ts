import { Pause, placesPausedAt, summariseWalk, WalkSample } from "@/src/3d/walkRecording";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { PointOfInterest } from "@/src/shared/poi";

// On the 6371 km sphere distanceMetres assumes, one degree of latitude is this long everywhere.
const metresPerDegreeOfLatitude = 111_195;

const origin = geoCoordsFromLatLongDegrees(51.5715, 8.1055);

function northOfOrigin(metres: number): GeoCoordinate {
  return geoCoordsFromLatLongDegrees(
    origin.latitudeDegrees + metres / metresPerDegreeOfLatitude,
    origin.longitudeDegrees,
  );
}

const sampleIntervalSeconds = 5;
const accurateFixMetres = 5;

// One sample every 5 s, walking north at the given speed until the next sample.
function samplesOf(speedsMetresPerSecond: (number | null)[]) {
  let metresNorth = 0;
  return speedsMetresPerSecond.map((speedMetresPerSecond, index): WalkSample => {
    const sample = {
      atSeconds: index * sampleIntervalSeconds,
      coordinate: northOfOrigin(metresNorth),
      speedMetresPerSecond,
      accuracyMetres: accurateFixMetres,
      isArTracking: true,
    };
    metresNorth += (speedMetresPerSecond ?? 0) * sampleIntervalSeconds;
    return sample;
  });
}

function fixAt(
  atSeconds: number,
  metresNorth: number,
  speedMetresPerSecond: number | null,
  accuracyMetres: number | null = accurateFixMetres,
): WalkSample {
  return {
    atSeconds,
    coordinate: northOfOrigin(metresNorth),
    speedMetresPerSecond,
    accuracyMetres,
    isArTracking: true,
  };
}

function summariseUntilLastFix(samples: WalkSample[]) {
  return summariseWalk(samples, samples.at(-1)?.atSeconds ?? 0);
}

function placeAt(id: string, subtype: string, coordinate: GeoCoordinate): PointOfInterest {
  return { id, category: "amenity", subtype, location: { coordinate, headingDegrees: 0 } };
}

describe("summariseWalk", () => {
  test("a stop of 20 s below 0.3 m/s is a pause, a 15 s stop is not", () => {
    const walking = 1.2;
    const samples = samplesOf([walking, walking, 0.1, 0.0, 0.2, walking, walking, 0.1, 0.0, 0.2, 0.29, walking]);

    const { pauses } = summariseUntilLastFix(samples);

    expect(pauses).toEqual([{ coordinate: samples[7]!.coordinate, durationSeconds: 20 }]);
  });

  test("a stop that lasts until the walk ends is a pause", () => {
    const samples = samplesOf([1.2, 0.1, 0.0, 0.0, 0.0, 0.1]);

    expect(summariseUntilLastFix(samples).pauses).toEqual([
      { coordinate: samples[1]!.coordinate, durationSeconds: 20 },
    ]);
  });

  test("walking fix, 25 s gap, walking fix about 1 m further on is a pause", () => {
    // Fixes are requested every metre, so after stopping the phone may report nothing until walking on.
    const lastFixBeforeStopping = fixAt(3, 3.9, 1.3);
    const samples = [fixAt(0, 0, 1.3), lastFixBeforeStopping, fixAt(28, 4.9, 1.3), fixAt(31, 8.8, 1.3)];

    expect(summariseUntilLastFix(samples).pauses).toEqual([
      { coordinate: lastFixBeforeStopping.coordinate, durationSeconds: 25 },
    ]);
  });

  test("a steady walk sampled every 3 s has no pause, nor does a gap in the fixes while walking on", () => {
    const steadyWalk = Array.from({ length: 40 }, (_, index) => fixAt(index * 3, index * 3.9, 1.3));
    const walkWithGap = [fixAt(0, 0, 1.3), fixAt(3, 3.9, 1.3), fixAt(28, 36.4, 1.3), fixAt(31, 40.3, 1.3)];

    expect(summariseUntilLastFix(steadyWalk).pauses).toEqual([]);
    expect(summariseUntilLastFix(walkWithGap).pauses).toEqual([]);
  });

  test("an unknown speed is judged by the distance covered", () => {
    const standing = [
      fixAt(0, 0, 1.2),
      fixAt(5, 6, null),
      fixAt(15, 6, null),
      fixAt(30, 6.5, null),
      fixAt(35, 12, 1.2),
    ];
    const walking = [fixAt(0, 0, 1.2), fixAt(5, 6, null), fixAt(15, 18, null), fixAt(30, 36, null), fixAt(35, 42, 1.2)];

    expect(summariseUntilLastFix(standing).pauses).toEqual([
      { coordinate: standing[1]!.coordinate, durationSeconds: 25 },
    ]);
    expect(summariseUntilLastFix(walking).pauses).toEqual([]);
  });

  test("standing while AR initialises is no pause; standing on once AR tracks counts from then", () => {
    const untilTracking = (samples: WalkSample[], trackingFromSeconds: number) =>
      samples.map((sample) => ({ ...sample, isArTracking: sample.atSeconds >= trackingFromSeconds }));
    const standingThenWalking = samplesOf([0, 0, 0, 0, 0, 0, 1.2, 1.2]);
    const standingOn = untilTracking(standingThenWalking, 5);

    expect(summariseUntilLastFix(untilTracking(standingThenWalking, 30)).pauses).toEqual([]);
    expect(summariseUntilLastFix(standingOn).pauses).toEqual([
      { coordinate: standingOn[1]!.coordinate, durationSeconds: 25 },
    ]);
  });

  test("a standing fix followed by silence until the walk ends is a pause", () => {
    const samples = [fixAt(0, 0, 1.3), fixAt(30, 39, 1.3), fixAt(35, 45.5, 0.1)];

    expect(summariseWalk(samples, 60).pauses).toEqual([{ coordinate: samples[2]!.coordinate, durationSeconds: 25 }]);
  });

  test("silence after the last fix is no pause unless that fix reported standing", () => {
    // A session with a single fix, and fixes that stop arriving at the end of a walk, e.g. in a GPS dropout.
    const singleWalkingFix = [fixAt(0, 0, 1.2)];
    const singleFixWithoutSpeed = [fixAt(0, 0, null)];
    const walkThenDropout = Array.from({ length: 13 }, (_, index) => fixAt(index * 5, index * 6.5, 1.3));

    expect(summariseWalk(singleWalkingFix, 90).pauses).toEqual([]);
    expect(summariseWalk(singleFixWithoutSpeed, 90).pauses).toEqual([]);
    expect(summariseWalk(walkThenDropout, 100).pauses).toEqual([]);
  });

  test("the median speed ignores pauses and is null without movement", () => {
    expect(summariseUntilLastFix(samplesOf([1.0, 0.1, 0.0, 0.2, 1.4, 0.0, 1.2])).medianSpeedMetresPerSecond).toBe(1.2);
    expect(summariseUntilLastFix(samplesOf([0.1, null, 0.0, 0.29])).medianSpeedMetresPerSecond).toBeNull();
  });

  test("inaccurate fixes do not count toward the walking speed", () => {
    const samples = [
      fixAt(0, 0, 1.0, 4),
      fixAt(5, 5, 1.6, 21),
      fixAt(10, 13, 1.7, null),
      fixAt(15, 21.5, 1.2, 12),
      fixAt(20, 27.5, 1.4, 20),
    ];

    expect(summariseUntilLastFix(samples).medianSpeedMetresPerSecond).toBe(1.2);
  });

  test("with only inaccurate fixes the median is null", () => {
    // Standing indoors, GPS jitter reports walking speeds with an accuracy of tens of metres.
    const jitteringIndoors = samplesOf([1.5, 1.6, 1.4, 1.7]).map((sample) => ({ ...sample, accuracyMetres: 35 }));

    expect(summariseUntilLastFix(jitteringIndoors).medianSpeedMetresPerSecond).toBeNull();
  });

  test("the AR tracking share is weighted by time", () => {
    const fixAtOrigin = (atSeconds: number, isArTracking: boolean): WalkSample => ({
      ...fixAt(atSeconds, 0, 1.2),
      isArTracking,
    });
    const samples = [fixAtOrigin(0, true), fixAtOrigin(10, false), fixAtOrigin(40, true), fixAtOrigin(50, true)];

    expect(summariseUntilLastFix(samples).arTrackingShare).toBeCloseTo(20 / 50);
  });

  test("the duration runs from the first fix until the walk ended", () => {
    expect(summariseUntilLastFix(samplesOf(Array(25).fill(1.2))).durationMinutes).toBe(2);
    expect(summariseWalk(samplesOf(Array(13).fill(1.2)), 120).durationMinutes).toBe(2);
    expect(summariseUntilLastFix([])).toEqual({
      durationMinutes: 0,
      medianSpeedMetresPerSecond: null,
      pauses: [],
      arTrackingShare: 0,
    });
  });
});

describe("placesPausedAt", () => {
  test("each pause engages the nearest place within 20 m", () => {
    const cafe = placeAt("cafe-1", "cafe", northOfOrigin(5));
    const bakery = placeAt("bakery-1", "bakery", northOfOrigin(15));
    const kiosk = placeAt("kiosk-1", "kiosk", northOfOrigin(115));
    const library = placeAt("library-1", "library", northOfOrigin(230));
    const pauses: Pause[] = [
      { coordinate: origin, durationSeconds: 30 },
      { coordinate: northOfOrigin(100), durationSeconds: 25 },
      { coordinate: northOfOrigin(200), durationSeconds: 40 },
    ];

    expect(placesPausedAt(pauses, [library, kiosk, bakery, cafe])).toEqual([cafe, kiosk]);
  });
});
