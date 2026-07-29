import { useEffect, useRef } from "react";
import { Vector3 } from "@math.gl/core";
import { LocationObjectCoords } from "expo-location";
import { asNum3, Num3, Transform } from "@/src/3d/math3d";
import { GeoTracking } from "@/src/3d/components/overlay/Overlay";
import { CameraGeospatialPose } from "@/src/3d/geopose";
import { jsonWithRoundedNumbers } from "@/src/shared/JavascriptExtensions";
import { AbsoluteTime, useTimeIntervalEffect } from "@/src/shared/ReactExtensions";
import { isMeasurementBuild } from "@/src/shared/Env";
import { log } from "@/src/shared/Logger";

// The raw positioning inputs of a walk, logged so that every positioning strategy can be replayed on the same walk
// and compared at surveyed checkpoints (docs/superpowers/specs/2026-10-21-positioning-fusion-design.md).
export type PositioningLogEntry =
  | { kind: "Origin"; latitudeDegrees: number; longitudeDegrees: number; altitudeMeters: number | null }
  | {
      kind: "Gps";
      atSeconds: number;
      latitudeDegrees: number;
      longitudeDegrees: number;
      altitudeMeters: number | null;
      accuracyMeters: number | null;
      cameraInWorld: Num3;
    }
  | {
      kind: "Arcore";
      atSeconds: number;
      latitudeDegrees: number;
      longitudeDegrees: number;
      altitudeMeters: number;
      headingDegrees: number;
      worldNorthDegrees: number;
      horizontalAccuracyMeters: number | null;
      verticalAccuracyMeters: number | null;
      yawAccuracyDegrees: number | null;
      cameraInWorld: Num3;
    }
  | { kind: "Compass"; atSeconds: number; worldNorthDegrees: number }
  | {
      kind: "Estimate";
      atSeconds: number;
      cameraInWorld: Num3;
      northSpacePositionInWorld: Num3;
      worldNorthDegrees: number;
      geoTracking: GeoTracking | null;
    }
  | { kind: "Checkpoint"; atSeconds: number; checkpointNumber: number };

type PositioningLogKind = PositioningLogEntry["kind"];

const positioningLogKinds: PositioningLogKind[] = ["Origin", "Gps", "Arcore", "Compass", "Estimate", "Checkpoint"];

// 7 decimals keep geo coordinates at centimetres; fewer would blur the checkpoint comparison.
const loggedFractionDigits = 7;

const positioningLogLinePattern = /POSITIONING \| (\w+) (\{.*\})\s*$/;

const estimateLogIntervalSeconds = 1;

// Only measurement builds log positions, so normal builds keep the user's location out of the device log.
const isLoggingPositions = isMeasurementBuild();

export function positioningLogLine(entry: PositioningLogEntry): string {
  const { kind, ...fields } = entry;
  return `POSITIONING | ${kind} ${jsonWithRoundedNumbers(fields, loggedFractionDigits)}`;
}

export function parsePositioningLogLine(line: string): PositioningLogEntry | null {
  const match = positioningLogLinePattern.exec(line);
  if (!match) return null;

  const [, kind, json] = match;
  if (!kind || !json || !isPositioningLogKind(kind)) return null;

  // The line was written by positioningLogLine, so its fields match the kind.
  return { kind, ...JSON.parse(json) } as PositioningLogEntry;
}

function isPositioningLogKind(kind: string): kind is PositioningLogKind {
  return positioningLogKinds.some((known) => known === kind);
}

export type PositioningLogInputs = {
  time: AbsoluteTime;
  geoOrigin: LocationObjectCoords;
  gpsFix: LocationObjectCoords;
  arcoreFix: CameraGeospatialPose | null;
  arcoreWorldNorthDegrees: number | null;
  compassWorldNorthDegrees: number;
  northSpacePositionInWorld: Vector3;
  worldNorthDegrees: number;
  geoTracking: GeoTracking | null;
  readCamera: () => Transform;
};

export function usePositioningLog(inputs: PositioningLogInputs) {
  const { time, geoOrigin, gpsFix, arcoreFix, arcoreWorldNorthDegrees, compassWorldNorthDegrees } = inputs;

  // A ref, because a new camera pose or a new frame time must not log another fix.
  const latestInputs = useRef(inputs);
  latestInputs.current = inputs;

  useEffect(() => {
    logPositioning({
      kind: "Origin",
      latitudeDegrees: geoOrigin.latitude,
      longitudeDegrees: geoOrigin.longitude,
      altitudeMeters: geoOrigin.altitude,
    });
  }, [geoOrigin]);

  useEffect(() => {
    logPositioning({
      kind: "Gps",
      atSeconds: latestInputs.current.time.nowSeconds,
      latitudeDegrees: gpsFix.latitude,
      longitudeDegrees: gpsFix.longitude,
      altitudeMeters: gpsFix.altitude,
      accuracyMeters: accuracyOrNull(gpsFix.accuracy),
      cameraInWorld: cameraInWorldOf(latestInputs.current),
    });
  }, [gpsFix]);

  useEffect(() => {
    if (!arcoreFix || arcoreWorldNorthDegrees === null) return;

    const { pose, camera } = arcoreFix;
    logPositioning({
      kind: "Arcore",
      atSeconds: latestInputs.current.time.nowSeconds,
      latitudeDegrees: pose.latitude,
      longitudeDegrees: pose.longitude,
      altitudeMeters: pose.altitude,
      headingDegrees: pose.heading,
      worldNorthDegrees: arcoreWorldNorthDegrees,
      horizontalAccuracyMeters: accuracyOrNull(pose.horizontalAccuracy),
      verticalAccuracyMeters: accuracyOrNull(pose.verticalAccuracy),
      yawAccuracyDegrees: accuracyOrNull(pose.orientationYawAccuracy),
      cameraInWorld: camera.viroTransform.position,
    });
  }, [arcoreFix, arcoreWorldNorthDegrees]);

  useEffect(() => {
    logPositioning({
      kind: "Compass",
      atSeconds: latestInputs.current.time.nowSeconds,
      worldNorthDegrees: compassWorldNorthDegrees,
    });
  }, [compassWorldNorthDegrees]);

  useTimeIntervalEffect(estimateLogIntervalSeconds, time, () => {
    const { northSpacePositionInWorld, worldNorthDegrees, geoTracking } = latestInputs.current;
    logPositioning({
      kind: "Estimate",
      atSeconds: latestInputs.current.time.nowSeconds,
      cameraInWorld: cameraInWorldOf(latestInputs.current),
      northSpacePositionInWorld: asNum3(northSpacePositionInWorld),
      worldNorthDegrees,
      geoTracking,
    });
  });
}

function cameraInWorldOf(inputs: PositioningLogInputs): Num3 {
  return inputs.readCamera().viroTransform.position;
}

function logPositioning(entry: PositioningLogEntry) {
  if (isLoggingPositions) log.info(positioningLogLine(entry));
}

export function accuracyOrNull(accuracy: number | null | undefined): number | null {
  if (accuracy === 0) return null; // sometimes we get a default value of 0 even though the measurement is not accurate at all
  return accuracy ?? null;
}
