import { useMemo } from "react";
import { eraseY, projectPointToSegment } from "./math3d";
import { Vector3 } from "@math.gl/core";
import { Instruction } from "@/src/shared/Directions";
import { clamp, degreesToRadians } from "@/src/shared/math";
import type { NavigationAudioMode } from "@/src/3d/components/NavigationAudio";
import Flatbush from "flatbush";

export type NavigationSound = "barking" | "wrong direction" | "danger";

// Going the right way (or having no route) is silent. The dog barks for every alert; the line
// navigator keeps distinct error/danger sounds.
export function navigationSoundFor(
  mode: NavigationAudioMode | null,
  navigator: "dog" | "line",
): NavigationSound | null {
  if (mode === null || mode === "correct direction") return null;
  if (navigator === "dog") return "barking";
  return mode; // "wrong direction" | "danger" already match their own line-mode sounds
}

/// Operates entirely within "North Space"
export function useNavigationState(
  user: Vector3,
  path: Vector3[] | null,
  instructions: Instruction[] | undefined,
  destination: Vector3,
) {
  const searchablePath = useMemo(() => (path && path.length >= 2 ? new IndexedPolygon(path) : null), [path]);

  const instructionsByCoordIndex = useMemo(
    () => (path && instructions && instructionsByCoord(path.length, instructions)) ?? null,
    [path, instructions],
  );

  const { distanceToRoute, pointOnSegment, closestSegmentStartIndex } = useMemo(
    () =>
      (searchablePath && searchablePath.findClosestSegment(user)) || {
        closestSegmentStartIndex: 0,
        distanceToRoute: 0,
        pointOnSegment: user,
      },
    [searchablePath, user],
  );

  const currentInstructionInfo = useMemo(
    () => instructionsByCoordIndex && instructionsByCoordIndex[closestSegmentStartIndex],
    [closestSegmentStartIndex, instructionsByCoordIndex],
  );

  const currentInstruction = currentInstructionInfo?.nextInstruction ?? null;

  const currentInstructionCoordIndex = currentInstruction ? currentInstruction.interval[0] : null;

  const currentInstructionPosition =
    (currentInstructionCoordIndex !== null && path && path[currentInstructionCoordIndex]) || null;

  return {
    closestSegmentStartIndex,
    distanceToRoute,
    closestPointOnRoute: pointOnSegment,
    currentInstructionPosition,
    currentInstruction,
  };
}

// The user counts as "heading the right way" when their view is within this cone of a target
// direction. A wide 90-degree cone keeps the "wrong direction" warning quiet unless the user is
// genuinely turned away from both the guide target and the route ahead.
const navigationDirectionConeHalfAngleDegrees = 90;
export const navigationDirectionConeCosine = Math.cos(degreesToRadians(navigationDirectionConeHalfAngleDegrees));

// Cosine of the horizontal angle between where the camera looks and a target direction: 1 when
// heading straight at it, 0 at a right angle, -1 when facing away. Both vectors are flattened onto
// the ground plane first, since only the compass heading matters for navigation. Returns null when
// either vector has no horizontal component (e.g. a zero-length route segment), so callers can tell
// "no usable direction" apart from "facing away".
export function groundHeadingAlignment(cameraForwardWorld: Vector3, targetDirectionWorld: Vector3): number | null {
  const forward = eraseY(cameraForwardWorld);
  const target = eraseY(targetDirectionWorld);
  const minimumHorizontalLengthSquared = 1e-6;
  if (forward.lengthSquared() < minimumHorizontalLengthSquared) return null;
  if (target.lengthSquared() < minimumHorizontalLengthSquared) return null;
  return forward.normalize().dot(target.normalize());
}

// Pedestrians walk on sidewalks several meters beside the routed street center line,
// so being this close to the route is no reason to lead the viewer toward it.
const minOnRouteToleranceMeters = 10;
// Leading straight toward the route would send the viewer across the street, and with a wrong position estimate,
// in a wrong direction.
const maxLeanTowardRouteRadians = degreesToRadians(45);
// Past the end of the route or of a route segment, e.g. after a missed turn, the closest route point lies behind the
// viewer, where leaning by at most 45° would lead further away. Slightly below 0, so that a route point exactly
// beside the viewer, the usual case, does not count as behind due to rounding.
const routeBehindCosine = -0.1;

// Where the guide leads: along the route while the viewer is probably on it, leaning toward the route once the viewer
// is farther from it than the positioning error, or straight back to it once it lies behind the viewer.
// The lean grows to its maximum over one more tolerance distance.
export function guideLeadDirection(
  routeDirection: Vector3,
  viewerToRoute: Vector3,
  geoAccuracyRadiusMeters: number | null,
): Vector3 {
  const along = eraseY(routeDirection).normalize();
  const towardRoute = eraseY(viewerToRoute);
  const sideways = towardRoute
    .clone()
    .subtract(along.clone().scale(towardRoute.dot(along)))
    .normalize();

  const toleranceMeters = Math.max(minOnRouteToleranceMeters, geoAccuracyRadiusMeters ?? 0);
  const leanFraction = clamp((towardRoute.len() - toleranceMeters) / toleranceMeters, 0, 1);
  const towardRouteDirection = towardRoute.clone().normalize();
  if (leanFraction > 0 && towardRouteDirection.dot(along) < routeBehindCosine) return towardRouteDirection;

  const leanRadians = leanFraction * maxLeanTowardRouteRadians;

  return along.scale(Math.cos(leanRadians)).add(sideways.scale(Math.sin(leanRadians)));
}

export type NavigationDirectionAudioInput = {
  isDanger: boolean;
  // Alignment with the current navigation guide target, or null when there is no route target.
  guideAlignment: number | null;
  // Alignment with the nearest route segment's forward direction, or null when there is no usable
  // segment to fall back to.
  segmentAlignment: number | null;
};

// Danger overrides everything. With no route target there is nothing to guide toward, so we stay
// silent. Otherwise the user is going the "correct direction" as long as they face within the cone
// of either the guide target or the route segment ahead; only failing both earns "wrong direction".
export function chooseNavigationAudioMode(input: NavigationDirectionAudioInput): NavigationAudioMode | null {
  if (input.isDanger) return "danger";
  if (input.guideAlignment === null) return null;

  const facingGuide = input.guideAlignment > navigationDirectionConeCosine;
  const facingSegment = input.segmentAlignment !== null && input.segmentAlignment > navigationDirectionConeCosine;
  return facingGuide || facingSegment ? "correct direction" : "wrong direction";
}

export function instructionsByCoord(routeLength: number, instructions: Instruction[]) {
  // Create array with O(n) time instead of O(n*m) by doing a single linear pass
  const result: { nextInstruction: Instruction | null }[] = new Array(routeLength);

  let instructionIndex = 0;

  for (let coordIndex = 0; coordIndex < routeLength; coordIndex++) {
    // Find the first instruction that hasn't been passed yet
    while (instructionIndex < instructions.length) {
      const instruction = instructions[instructionIndex];
      if (instruction && coordIndex > instruction.interval[1]) {
        instructionIndex++;
      } else {
        break;
      }
    }

    result[coordIndex] = {
      nextInstruction: instructionIndex < instructions.length ? (instructions[instructionIndex] ?? null) : null,
    };
  }

  return result;
}

export class IndexedPolygon {
  private map: Flatbush;

  constructor(private polygon: Vector3[]) {
    this.map = new Flatbush(polygon.length - 1);

    for (let segmentIndex = 0; segmentIndex < polygon.length - 1; segmentIndex++) {
      const a = polygon[segmentIndex]!;
      const b = polygon[segmentIndex + 1]!;
      const bbox = [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)] as const;
      this.map.add(...bbox);
    }

    this.map.finish();
  }

  findClosestSegment(user: Vector3) {
    const boxRadius = 0.1;

    const nearSegments = this.map.search(
      user.x - boxRadius,
      user.z - boxRadius,
      user.x + boxRadius,
      user.z + boxRadius,
    );

    if (nearSegments.length === 0) {
      nearSegments.push(...this.map.neighbors(user.x, user.z, 5));
    }

    if (nearSegments.length === 0) {
      throw new Error("Route exists but cannot be located");
    }

    let closestSegmentStartIndex = 0;
    let closestSqrDistance = Number.POSITIVE_INFINITY;
    let pointOnClosestSegment: Vector3 = Vector3.ZERO;

    for (const segmentStartIndex of nearSegments) {
      const currentNode = this.polygon[segmentStartIndex]!;
      const nextNode = this.polygon[segmentStartIndex + 1]!;
      const onSegment = projectPointToSegment(user, [currentNode, nextNode]);

      const sqrDistanceToCurrentNode = user.distanceToSquared(onSegment);
      if (sqrDistanceToCurrentNode < closestSqrDistance) {
        closestSegmentStartIndex = segmentStartIndex;
        closestSqrDistance = sqrDistanceToCurrentNode;
        pointOnClosestSegment = onSegment;
      }
    }

    return {
      closestSegmentStartIndex: closestSegmentStartIndex,
      distanceToRoute: Math.sqrt(closestSqrDistance),
      pointOnSegment: pointOnClosestSegment,
    };
  }
}

export class IndexedSegments {
  private map: Flatbush;

  constructor(private segments: { start: Vector3; end: Vector3; width: number }[]) {
    this.map = new Flatbush(segments.length);

    for (const segment of segments) {
      const r = segment.width / 2;
      const a = segment.start;
      const b = segment.end;

      const bbox = [
        Math.min(a.x, b.x) - r,
        Math.min(a.z, b.z) - r,
        Math.max(a.x, b.x) + r,
        Math.max(a.z, b.z) + r,
      ] as const;

      this.map.add(...bbox);
    }

    this.map.finish();
  }

  // Note: `distance` will be negative when user is on the road.
  findClosestIntersectingSegment(user: Vector3, radius: number) {
    const nearSegmentIndices = this.map.search(user.x - radius, user.z - radius, user.x + radius, user.z + radius);
    if (nearSegmentIndices.length === 0) return null;

    let largestIntersectionDepth = Number.NEGATIVE_INFINITY;
    let deepestSegmentIndex: number = 0;

    for (const segmentIndex of nearSegmentIndices) {
      const segment = this.segments[segmentIndex]!;
      const onSegment = projectPointToSegment(user, [segment.start, segment.end]);
      const distanceToCenter = user.distanceTo(onSegment);
      const segmentPadding = segment.width / 2;
      const intersectionDepth = segmentPadding - distanceToCenter;

      if (intersectionDepth > largestIntersectionDepth) {
        deepestSegmentIndex = segmentIndex;
        largestIntersectionDepth = intersectionDepth;
      }
    }

    return {
      intersectionDepth: largestIntersectionDepth,
      segmentIndex: deepestSegmentIndex,
    };
  }

  findClosestSegments(user: Vector3, count: number) {
    const neighborIndices = this.map.neighbors(user.x, user.z, count);
    return neighborIndices.map((index) => this.segments[index]!);
  }
}

export class IndexedPoints {
  private map: Flatbush;

  constructor(private points: { position: Vector3; radius: number }[]) {
    this.map = new Flatbush(points.length);

    for (const point of points) {
      const r = point.radius;
      const { x, z } = point.position;
      const bbox = [x - r, z - r, x + r, z + r] as const;
      this.map.add(...bbox);
    }

    this.map.finish();
  }

  findClosestNearbyPoint(user: Vector3, padding: number) {
    const nearPointIndices = this.map.search(user.x - padding, user.z - padding, user.x + padding, user.z + padding);
    if (nearPointIndices.length === 0) return null;

    let closestSqrDistance = Number.POSITIVE_INFINITY;
    let closestIndex: number = 0;

    for (const pointIndex of nearPointIndices) {
      const point = this.points[pointIndex]!;
      const sqrDistanceToCurrentNode = user.distanceToSquared(point.position);

      if (sqrDistanceToCurrentNode < closestSqrDistance) {
        closestIndex = pointIndex;
        closestSqrDistance = sqrDistanceToCurrentNode;
      }
    }

    return {
      closestPointIndex: closestIndex,
      distanceToPoint: Math.sqrt(closestSqrDistance),
    };
  }

  findClosestPoints(user: Vector3, count: number, maxDistance: number) {
    return this.map.neighbors(user.x, user.z, count, maxDistance);
  }
}
