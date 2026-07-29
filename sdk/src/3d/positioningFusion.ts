import { Vector2, Vector3 } from "@math.gl/core";
import { viroRotationToQuaternion } from "@/src/3d/math3d";
import { enumerate, findMinimumBy } from "@/src/shared/JavascriptExtensions";
import { degreesToRadians, radiansToDegrees, signedDegreesBetween, wrap } from "@/src/shared/math";

// Fuses ARCore geospatial poses, GPS fixes, compass headings and the walked AR path into one estimate of the
// north space: how the geo frame (x east, z south, as geoToLocal returns it) sits in the AR world.
// AR tracking is locally consistent, so all recent fixes describe the same rigid alignment. A geo position fix taken
// at a known camera position constrains rotation and origin; fixes taken along a walked path also give the heading
// of the walked AR path relative to the GPS track, without a separate input for it.
// Horizontal vectors are Vector2(x, z) of the AR world or of the geo frame.

export type NorthSpaceAlignment = { worldNorthDegrees: number; geoOriginInWorld: Vector2 };

export type PositioningSource = "gps" | "arcore" | "compass";

export type PositionFix = {
  source: PositioningSource;
  atSeconds: number;
  walkedMeters: number;
  cameraInWorld: Vector2;
  geoLocal: Vector2;
  accuracyMeters: number;
};

export type HeadingFix = {
  source: PositioningSource;
  atSeconds: number;
  walkedMeters: number;
  worldNorthDegrees: number;
  accuracyDegrees: number;
};

export type FusionParameters = {
  // AR tracking drifts with the distance walked, so an old fix describes today's alignment less precisely
  driftFraction: number;
  headingDriftDegreesPerMeter: number;
  maxEffectiveSigmaMeters: number;
  maxAgeSeconds: number;
  outlierSigmas: number;
  // Consecutive fixes of one source share most of their error (GPS multipath, ARCore's own filter), so fixes closer
  // than this together count as one independent fix.
  independentSeconds: number;
  // the magnetometer reports no accuracy
  compassAccuracyDegrees: number;
};

export const fusionParameters: FusionParameters = {
  driftFraction: 0.02,
  headingDriftDegreesPerMeter: 0.05,
  maxEffectiveSigmaMeters: 30,
  maxAgeSeconds: 300,
  outlierSigmas: 3,
  independentSeconds: 10,
  // RMS difference to confident ARCore headings (yaw accuracy below 5°) on the checkpoint walk of 2026-10-21,
  // 40 samples, set before that walk was scored against the checkpoints
  compassAccuracyDegrees: 39,
};

// ARCore and Android report a position's accuracy as the radius holding the true position with 68 % probability.
// For a circular normal distribution that radius is about 1.51 sigma per axis.
const radius68PerSigma = Math.sqrt(-2 * Math.log(1 - 0.68));

export const relocalizationMetersPerSecond = 3;

const coarseSearchStepDegrees = 1;
const fineSearchStepDegrees = 0.01;

// variance: of the fix alone (for outlier tests); weight: its share of independent information divided by the variance
type Weighted<T> = { fix: T; variance: number; weight: number };

export function positionSigmaMeters(accuracyMeters: number): number {
  return accuracyMeters / radius68PerSigma;
}

export function geoLocalToWorld(alignment: NorthSpaceAlignment, geoLocal: Vector2): Vector2 {
  return rotatedByDegrees(geoLocal, alignment.worldNorthDegrees).add(alignment.geoOriginInWorld);
}

export function worldToGeoLocal(alignment: NorthSpaceAlignment, world: Vector2): Vector2 {
  return rotatedByDegrees(world.clone().subtract(alignment.geoOriginInWorld), -alignment.worldNorthDegrees);
}

export function isRelocalizationJump(
  from: { atSeconds: number; cameraInWorld: Vector2 },
  to: { atSeconds: number; cameraInWorld: Vector2 },
): boolean {
  const metersPerSecond = from.cameraInWorld.distance(to.cameraInWorld) / (to.atSeconds - from.atSeconds);
  return metersPerSecond > relocalizationMetersPerSecond;
}

export function fuseAlignment(
  positions: PositionFix[],
  headings: HeadingFix[],
  now: { atSeconds: number; walkedMeters: number },
  parameters: FusionParameters,
): NorthSpaceAlignment | null {
  const isRecent = (fix: { atSeconds: number }) => now.atSeconds - fix.atSeconds <= parameters.maxAgeSeconds;
  const walkedSince = (fix: { walkedMeters: number }) => now.walkedMeters - fix.walkedMeters;

  const weightedPositions = withIndependenceWeights(
    positions
      .filter(isRecent)
      .map((fix) => ({
        fix,
        variance: positionSigmaMeters(fix.accuracyMeters) ** 2 + (parameters.driftFraction * walkedSince(fix)) ** 2,
      }))
      .filter(({ variance }) => Math.sqrt(variance) <= parameters.maxEffectiveSigmaMeters),
    parameters.independentSeconds,
  );

  const recentHeadings = headings.filter(isRecent).map((fix) => ({
    fix,
    variance: fix.accuracyDegrees ** 2 + (parameters.headingDriftDegreesPerMeter * walkedSince(fix)) ** 2,
  }));
  const weightedHeadings = [
    ...withIndependenceWeights(
      recentHeadings.filter(({ fix }) => fix.source !== "compass"),
      parameters.independentSeconds,
    ),
    ...combinedCompass(recentHeadings.filter(({ fix }) => fix.source === "compass")),
  ];

  if (!canFit(weightedPositions, weightedHeadings)) return null;
  const firstFit = fitAlignment(weightedPositions, weightedHeadings);

  const isWithinSigmas = (residual: number, variance: number) =>
    residual <= parameters.outlierSigmas * Math.sqrt(variance);
  const keptPositions = weightedPositions.filter(({ fix, variance }) =>
    isWithinSigmas(positionResidualMeters(firstFit, fix), variance),
  );
  const keptHeadings = weightedHeadings.filter(({ fix, variance }) =>
    isWithinSigmas(Math.abs(signedDegreesBetween(firstFit.worldNorthDegrees, fix.worldNorthDegrees)), variance),
  );

  const rejectedAny = keptPositions.length < weightedPositions.length || keptHeadings.length < weightedHeadings.length;
  if (!rejectedAny || !canFit(keptPositions, keptHeadings)) return firstFit;
  return fitAlignment(keptPositions, keptHeadings);
}

// Without a heading, the rotation follows only from fixes taken at different camera positions.
function canFit(positions: Weighted<PositionFix>[], headings: Weighted<HeadingFix>[]): boolean {
  return positions.length > 0 && (headings.length > 0 || positions.length > 1);
}

// Weighted least squares. For a given rotation the best origin is a weighted mean, so only the rotation is searched.
function fitAlignment(positions: Weighted<PositionFix>[], headings: Weighted<HeadingFix>[]): NorthSpaceAlignment {
  const costOf = (alignment: NorthSpaceAlignment) =>
    positions.reduce((sum, { fix, weight }) => sum + positionResidualMeters(alignment, fix) ** 2 * weight, 0) +
    headings.reduce(
      (sum, { fix, weight }) =>
        sum + signedDegreesBetween(alignment.worldNorthDegrees, fix.worldNorthDegrees) ** 2 * weight,
      0,
    );
  const bestOf = (candidateDegrees: number[]) =>
    findMinimumBy(
      candidateDegrees.map((degrees) => alignmentWithBestOrigin(wrap(degrees, 360), positions)),
      costOf,
    );

  const coarse = bestOf(enumerate(360 / coarseSearchStepDegrees).map((step) => step * coarseSearchStepDegrees));
  const fineSteps = (2 * coarseSearchStepDegrees) / fineSearchStepDegrees;
  const fine = bestOf(
    enumerate(fineSteps + 1).map(
      (step) => (coarse?.worldNorthDegrees ?? 0) - coarseSearchStepDegrees + step * fineSearchStepDegrees,
    ),
  );
  if (!fine) throw new Error("The rotation search has no candidates.");
  return fine;
}

function alignmentWithBestOrigin(worldNorthDegrees: number, positions: Weighted<PositionFix>[]): NorthSpaceAlignment {
  const unshifted = { worldNorthDegrees, geoOriginInWorld: new Vector2(0, 0) };
  let weightSum = 0;
  const weightedOrigins = new Vector2(0, 0);

  for (const { fix, weight } of positions) {
    const origin = fix.cameraInWorld.clone().subtract(geoLocalToWorld(unshifted, fix.geoLocal));
    weightedOrigins.add(origin.scale(weight));
    weightSum += weight;
  }

  return { worldNorthDegrees, geoOriginInWorld: weightedOrigins.scale(1 / weightSum) };
}

function withIndependenceWeights<T extends { source: PositioningSource; atSeconds: number }>(
  fixes: { fix: T; variance: number }[],
  independentSeconds: number,
): Weighted<T>[] {
  const previousAtSecondsBySource = new Map<PositioningSource, number>();

  return [...fixes]
    .sort((a, b) => a.fix.atSeconds - b.fix.atSeconds)
    .flatMap(({ fix, variance }) => {
      const previousAtSeconds = previousAtSecondsBySource.get(fix.source);
      previousAtSecondsBySource.set(fix.source, fix.atSeconds);
      const share =
        previousAtSeconds === undefined ? 1 : Math.min(1, (fix.atSeconds - previousAtSeconds) / independentSeconds);
      return share > 0 ? [{ fix, variance, weight: share / variance }] : [];
    });
}

// The compass error is mostly a bias that does not average out (walk of 2026-10-21: 8-23° below ARCore at 13 of
// 14 taps), so all compass samples in the window together count as one heading with the compass accuracy.
function combinedCompass(compass: { fix: HeadingFix; variance: number }[]): Weighted<HeadingFix>[] {
  const mostPrecise = findMinimumBy(compass, ({ variance }) => variance);
  if (!mostPrecise) return [];

  const sum = compass.reduce(
    (vector, { fix, variance }) => {
      const radians = degreesToRadians(fix.worldNorthDegrees);
      return vector.add(new Vector2(Math.cos(radians), Math.sin(radians)).scale(1 / variance));
    },
    new Vector2(0, 0),
  );
  const meanDegrees = wrap(radiansToDegrees(Math.atan2(sum.y, sum.x)), 360);

  return [
    {
      fix: { ...mostPrecise.fix, worldNorthDegrees: meanDegrees },
      variance: mostPrecise.variance,
      weight: 1 / mostPrecise.variance,
    },
  ];
}

function positionResidualMeters(alignment: NorthSpaceAlignment, fix: PositionFix): number {
  return geoLocalToWorld(alignment, fix.geoLocal).distance(fix.cameraInWorld);
}

// The same rotation about the vertical axis as the north-space node's [0, degrees, 0].
function rotatedByDegrees(vector: Vector2, degrees: number): Vector2 {
  const rotated = new Vector3(vector.x, 0, vector.y).transformByQuaternion(viroRotationToQuaternion([0, degrees, 0]));
  return new Vector2(rotated.x, rotated.z);
}
