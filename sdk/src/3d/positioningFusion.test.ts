import { Vector2, Vector3 } from "@math.gl/core";
import {
  fuseAlignment,
  fusionParameters,
  geoLocalToWorld,
  HeadingFix,
  isRelocalizationJump,
  NorthSpaceAlignment,
  PositionFix,
  positionSigmaMeters,
  PositioningSource,
  worldToGeoLocal,
} from "@/src/3d/positioningFusion";
import { computeTransform, withoutY } from "@/src/3d/math3d";
import { signedDegreesBetween } from "@/src/shared/math";

const lShapedPath = [
  new Vector2(0, 0),
  new Vector2(10, 0),
  new Vector2(20, 0),
  new Vector2(20, -10),
  new Vector2(20, -20),
  new Vector2(20, -30),
];

const straightPath = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector2(i * 5, i * 2));

// Exact GPS fixes of a known alignment along a camera path, independent in time (10 s apart),
// walked distance accumulated along the path.
function exactFixesAlong(alignment: NorthSpaceAlignment, path: Vector2[], accuracyMeters: number): PositionFix[] {
  let walkedMeters = 0;
  return path.map((cameraInWorld, index) => {
    const previous = path[index - 1];
    if (previous) walkedMeters += cameraInWorld.distance(previous);
    return {
      source: "gps" as const,
      atSeconds: index * 10,
      walkedMeters,
      cameraInWorld,
      geoLocal: worldToGeoLocal(alignment, cameraInWorld),
      accuracyMeters,
    };
  });
}

function headingFix(
  worldNorthDegrees: number,
  accuracyDegrees: number,
  walkedMeters: number,
  atSeconds = 5,
  source: PositioningSource = "arcore",
): HeadingFix {
  return { source, atSeconds, walkedMeters, worldNorthDegrees, accuracyDegrees };
}

function lastOf(fixes: PositionFix[]): PositionFix {
  const last = fixes[fixes.length - 1];
  if (!last) throw new Error("no fixes");
  return last;
}

function nowAfter(fixes: PositionFix[]) {
  const last = lastOf(fixes);
  return { atSeconds: last.atSeconds, walkedMeters: last.walkedMeters };
}

function expectAlignmentCloseTo(actual: NorthSpaceAlignment | null, expected: NorthSpaceAlignment, digits: number) {
  if (!actual) throw new Error("no alignment");
  expect(signedDegreesBetween(actual.worldNorthDegrees, expected.worldNorthDegrees)).toBeCloseTo(0, digits);
  expect(actual.geoOriginInWorld.x).toBeCloseTo(expected.geoOriginInWorld.x, digits);
  expect(actual.geoOriginInWorld.y).toBeCloseTo(expected.geoOriginInWorld.y, digits);
}

describe("positioning fusion", () => {
  it("uses the same convention as the north-space transform", () => {
    const alignment = { worldNorthDegrees: 30, geoOriginInWorld: new Vector2(5, -3) };
    const northSpace = computeTransform({ position: [5, 0, -3], rotation: [0, 30, 0], scale: [1, 1, 1] });
    const geoLocal = new Vector2(2, 7);

    const expected = withoutY(new Vector3(2, 0, 7).transformAsPoint(northSpace.localToParent));
    const world = geoLocalToWorld(alignment, geoLocal);

    expect(world.x).toBeCloseTo(expected.x, 9);
    expect(world.y).toBeCloseTo(expected.y, 9);
    expect(worldToGeoLocal(alignment, world).x).toBeCloseTo(geoLocal.x, 9);
    expect(worldToGeoLocal(alignment, world).y).toBeCloseTo(geoLocal.y, 9);
  });

  it("recovers a known alignment from exact fixes", () => {
    const truth = { worldNorthDegrees: 37, geoOriginInWorld: new Vector2(4, -2) };
    const positions = exactFixesAlong(truth, lShapedPath, 2);
    const now = nowAfter(positions);
    const headings = [10, 20, 30].map((atSeconds) => headingFix(37, 5, now.walkedMeters, atSeconds));

    expectAlignmentCloseTo(fuseAlignment(positions, headings, now, fusionParameters), truth, 2);
  });

  it("derives the heading from a GPS track along the walked AR path", () => {
    const truth = { worldNorthDegrees: 120, geoOriginInWorld: new Vector2(0, 0) };
    const positions = exactFixesAlong(truth, straightPath, 5);

    const result = fuseAlignment(positions, [], nowAfter(positions), fusionParameters);

    expect(Math.abs(signedDegreesBetween(result?.worldNorthDegrees ?? NaN, 120))).toBeLessThan(0.1);
  });

  describe("with two disagreeing fixes taken at the same camera position", () => {
    const camera = new Vector2(5, 5);
    const preciseFix = {
      source: "arcore" as const,
      atSeconds: 1,
      walkedMeters: 100,
      cameraInWorld: camera,
      geoLocal: new Vector2(0, 0),
    };
    const coarseFix = {
      source: "gps" as const,
      atSeconds: 1,
      walkedMeters: 100,
      cameraInWorld: camera,
      geoLocal: new Vector2(6, 0),
    };
    const northHeading = headingFix(0, 1, 100);

    it("weights fixes by their accuracy", () => {
      const positions = [
        { ...preciseFix, accuracyMeters: 1 },
        { ...coarseFix, accuracyMeters: 3 },
      ];

      const result = fuseAlignment(positions, [northHeading], { atSeconds: 1, walkedMeters: 100 }, fusionParameters);

      // weights 1/1² and 1/3²: (0 · 1 + 6 · 1/9) / (1 + 1/9)
      expect(result && worldToGeoLocal(result, camera).x).toBeCloseTo(0.6, 2);
    });

    it("counts fixes less the farther the user has walked since", () => {
      const positions = [
        { ...preciseFix, walkedMeters: 0, accuracyMeters: 1 },
        { ...coarseFix, accuracyMeters: 3 },
      ];

      const result = fuseAlignment(positions, [northHeading], { atSeconds: 1, walkedMeters: 100 }, fusionParameters);

      // the precise fix drifted 2 % of 100 m, which adds 2 m to its sigma per axis
      const preciseWeight = 1 / (positionSigmaMeters(1) ** 2 + 2 ** 2);
      const coarseWeight = 1 / positionSigmaMeters(3) ** 2;
      expect(result && worldToGeoLocal(result, camera).x).toBeCloseTo(
        (6 * coarseWeight) / (preciseWeight + coarseWeight),
        2,
      );
    });
  });

  it("ignores a multipath fix far beyond its accuracy", () => {
    const truth = { worldNorthDegrees: 200, geoOriginInWorld: new Vector2(-7, 12) };
    const longPath = [
      ...lShapedPath,
      new Vector2(20, -40),
      new Vector2(25, -40),
      new Vector2(30, -40),
      new Vector2(35, -40),
    ];
    const positions = exactFixesAlong(truth, longPath, 3);
    const middle = positions[4];
    if (!middle) throw new Error("no middle fix");
    const multipath = {
      ...middle,
      atSeconds: middle.atSeconds + 5,
      geoLocal: middle.geoLocal.clone().add(new Vector2(40, 0)),
    };
    const now = nowAfter(positions);

    const result = fuseAlignment(
      [...positions, multipath],
      [headingFix(200, 45, now.walkedMeters)],
      now,
      fusionParameters,
    );
    if (!result) throw new Error("no alignment");

    const lastCamera = lastOf(positions).cameraInWorld;
    expect(worldToGeoLocal(result, lastCamera).distance(worldToGeoLocal(truth, lastCamera))).toBeLessThan(0.5);
    expect(Math.abs(signedDegreesBetween(result.worldNorthDegrees, 200))).toBeLessThan(1);
  });

  it("drops fixes older than the window", () => {
    const truth = { worldNorthDegrees: 37, geoOriginInWorld: new Vector2(4, -2) };
    const positions = exactFixesAlong(truth, lShapedPath, 2);
    const now = { atSeconds: 500, walkedMeters: lastOf(positions).walkedMeters };
    const recent = positions.map((fix) => ({ ...fix, atSeconds: 440 + fix.atSeconds }));
    const tooOld = { ...lastOf(recent), atSeconds: now.atSeconds - 301, geoLocal: new Vector2(500, 500) };
    const headings = [headingFix(37, 5, now.walkedMeters, 499)];

    const withOld = fuseAlignment([...recent, tooOld], headings, now, fusionParameters);
    const withoutOld = fuseAlignment(recent, headings, now, fusionParameters);

    expect(withOld).toEqual(withoutOld);
  });

  it("averages headings across north", () => {
    const camera = new Vector2(1, 1);
    const positions = [1, 2].map((atSeconds) => ({
      source: "gps" as const,
      atSeconds,
      walkedMeters: 0,
      cameraInWorld: camera,
      geoLocal: new Vector2(3, 3),
      accuracyMeters: 2,
    }));

    const result = fuseAlignment(
      positions,
      [headingFix(359, 5, 0, 1), headingFix(1, 5, 0, 11)],
      { atSeconds: 12, walkedMeters: 0 },
      fusionParameters,
    );

    expect(Math.abs(signedDegreesBetween(result?.worldNorthDegrees ?? NaN, 0))).toBeLessThan(0.01);
  });

  it("has no estimate without position fixes, or without any heading information", () => {
    const truth = { worldNorthDegrees: 37, geoOriginInWorld: new Vector2(4, -2) };
    const [onlyFix] = exactFixesAlong(truth, lShapedPath, 2);
    if (!onlyFix) throw new Error("no fix");
    const now = { atSeconds: 1, walkedMeters: 0 };

    expect(fuseAlignment([], [headingFix(37, 5, 0)], now, fusionParameters)).toBeNull();
    expect(fuseAlignment([onlyFix], [], now, fusionParameters)).toBeNull();
  });

  it("counts many compass samples as one heading measurement", () => {
    const truth = { worldNorthDegrees: 120, geoOriginInWorld: new Vector2(0, 0) };
    const positions = exactFixesAlong(truth, straightPath, 5);
    const now = nowAfter(positions);
    // a compass 20° off, sampled every 0.7 s along the walk
    const compass = Array.from({ length: 100 }, (_, index) =>
      headingFix(140, 15, now.walkedMeters, index * 0.7, "compass"),
    );

    const result = fuseAlignment(positions, compass, now, fusionParameters);

    expect(Math.abs(signedDegreesBetween(result?.worldNorthDegrees ?? NaN, 120))).toBeLessThan(5);
  });

  it("counts fixes of one source closer than the independence time as one", () => {
    const camera = new Vector2(5, 5);
    const fix = { cameraInWorld: camera, walkedMeters: 0, accuracyMeters: 3 };
    const gpsEverySecond = Array.from({ length: 10 }, (_, second) => ({
      ...fix,
      source: "gps" as const,
      atSeconds: second,
      geoLocal: new Vector2(6, 0),
    }));
    const arcore = { ...fix, source: "arcore" as const, atSeconds: 9, geoLocal: new Vector2(0, 0) };

    const result = fuseAlignment(
      [...gpsEverySecond, arcore],
      [headingFix(0, 1, 0, 9)],
      { atSeconds: 9, walkedMeters: 0 },
      fusionParameters,
    );

    // the first GPS fix counts fully, the 9 following ones a tenth each (1 s of 10 s): 1.9 GPS fixes against 1
    expect(result && worldToGeoLocal(result, camera).x).toBeCloseTo((6 * 1.9) / 2.9, 2);
  });

  it("reads a 68 % position radius as a per-axis sigma", () => {
    // P(r < k sigma) = 1 - exp(-k² / 2) = 0.68 for a circular normal distribution
    expect(positionSigmaMeters(1.5096)).toBeCloseTo(1, 3);
  });

  it("detects relocalization jumps", () => {
    const from = { atSeconds: 10, cameraInWorld: new Vector2(0, 0) };

    expect(isRelocalizationJump(from, { atSeconds: 11, cameraInWorld: new Vector2(4, 0) })).toBe(true);
    expect(isRelocalizationJump(from, { atSeconds: 11, cameraInWorld: new Vector2(2, 0) })).toBe(false);
  });
});
