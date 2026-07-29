import { clamp, mutatingSortBy, useRateOfChangeNumber, useRateOfChangeVector3OrNull } from "@/src/shared/math";
import { DeviceProps, SceneProps } from "@/src/3d/components/Navigation";
import { arrayToVector3 } from "@/src/3d/math3d";
import { useTimeSmoothingNumber } from "@/src/shared/ReactExtensions";
import { useMemo } from "react";

export type DangerState =
  | { variant: "no danger" }
  | {
      variant: "danger" | "possible danger";
      reason: DangerReason;
    };

/// Either one cause that is dangerous on its own, or several smaller causes that only add up to a danger together.
export type DangerReason = { dominantCause: DominantDangerCause } | { causes: (keyof DangerMetrics)[] };

export type DominantDangerCause = "crossing road" | "vehicles" | "walking" | "intersection";

export type StreetInfo = {
  nearestStreetIntersectionDepth: number | null;
  distanceToClosestIntersection: number | null;
};

export type DangerMetrics = {
  roadVisible: number;
  vehicleVisible: number;
  userSpeedPercentage: number;
  userIsOnRoad: number;
  userIsOnRoadNextSecond: number;
  isAtCrossing: number;
};

export function summarizeDanger(metrics: DangerMetrics): DangerState {
  if (metrics.roadVisible > 0.7) {
    return { variant: "possible danger", reason: { dominantCause: "crossing road" } };
  }

  if (metrics.vehicleVisible > 0.8) {
    return { variant: "possible danger", reason: { dominantCause: "vehicles" } };
  }

  if (metrics.userIsOnRoad > 0.8 || metrics.userIsOnRoadNextSecond > 0.8) {
    return { variant: "danger", reason: { dominantCause: "crossing road" } };
  }

  if (metrics.userSpeedPercentage > 0.8) {
    return { variant: "possible danger", reason: { dominantCause: "walking" } };
  }

  if (metrics.isAtCrossing > 0.8 && metrics.userSpeedPercentage > 0.2) {
    return { variant: "danger", reason: { dominantCause: "intersection" } };
  }

  const metricsList = Object.entries(metrics) as [keyof DangerMetrics, number][];
  mutatingSortBy(metricsList, ([, val]) => val);

  const smallDangersThreshold = 0.3;
  const smallDangerCount = 4;

  const topMetrics = metricsList.reverse().slice(0, smallDangerCount);
  const areMultipleSmallDangers = topMetrics.every(([, v]) => v > smallDangersThreshold);
  const totalDanger = topMetrics.map(([, v]) => v).reduce((s, v) => s + v, 0);

  if (areMultipleSmallDangers && totalDanger > 2) {
    return { variant: "danger", reason: { causes: topMetrics.map(([key]) => key) } };
  }

  return { variant: "no danger" };
}

export function useDetectDangerMetrics(
  scene: SceneProps,
  device: DeviceProps | null,
  streetInfo: StreetInfo | null,
): DangerMetrics {
  const smoothingSpeed = 5;
  const vision = scene.vision;
  const time = scene.time;
  const user = device && arrayToVector3(device.camera.viroTransform.position);
  const userSpeed = useRateOfChangeVector3OrNull(user, time);
  const gpsPrecisionRadiusMeters = device?.geoLocation?.accuracy || 30;

  const roadVisibleRaw = vision?.road ?? 0;
  const roadVisible = useTimeSmoothingNumber(roadVisibleRaw, smoothingSpeed, scene.time);

  const vehicleVisibleRaw = vision?.vehicle ?? 0;
  const vehicleVisible = useTimeSmoothingNumber(vehicleVisibleRaw, smoothingSpeed, scene.time);

  const maxUserSpeedMetresPerSecond = 0.5;
  const userSpeedPercentageRaw = (userSpeed?.len() || 0) / maxUserSpeedMetresPerSecond;
  const userSpeedPercentage = useTimeSmoothingNumber(
    clamp(userSpeedPercentageRaw, 0, 1),
    smoothingSpeed / 2,
    scene.time,
  );

  const userIsOnRoadRaw = (streetInfo?.nearestStreetIntersectionDepth ?? -10) - gpsPrecisionRadiusMeters * 0.3;
  const userIsOnRoad = useTimeSmoothingNumber(userIsOnRoadRaw, smoothingSpeed / 2, scene.time);

  const userGoingToRoadSpeed = useRateOfChangeNumber(userIsOnRoad, time);
  const userOnRoadNextSecondRaw = userIsOnRoad + userGoingToRoadSpeed * 0.1;
  const userIsOnRoadNextSecond = useTimeSmoothingNumber(userOnRoadNextSecondRaw, smoothingSpeed / 2, scene.time);

  const distanceToClosestIntersection = streetInfo?.distanceToClosestIntersection ?? null;
  const isAtCrossingRaw = distanceToClosestIntersection === null ? 0 : clamp(7 - distanceToClosestIntersection, 0, 1);
  const isAtCrossing = useTimeSmoothingNumber(isAtCrossingRaw, smoothingSpeed, scene.time);

  // Round values to stabilize and prevent excessive updates.
  // Without rounding, tiny floating-point changes trigger new object creation,
  // which triggers useEffect(() => onDangerStatusChanged(danger), [danger]) in Navigation.tsx,
  // causing parent re-renders and potential infinite loops.
  const roundedRoadVisible = stabilize(shape(roadVisible, 2));
  const roundedVehicleVisible = stabilize(shape(vehicleVisible, 0.5));
  const roundedUserSpeedPercentage = stabilize(shape(userSpeedPercentage, 1));
  const roundedUserIsOnRoad = stabilize(shape(userIsOnRoad, 2));
  const roundedUserIsOnRoadNextSecond = stabilize(shape(userIsOnRoadNextSecond, 2));
  const roundedIsAtCrossing = stabilize(shape(isAtCrossing, 1));

  const metrics = useMemo(
    () => ({
      roadVisible: roundedRoadVisible,
      vehicleVisible: roundedVehicleVisible,
      userSpeedPercentage: roundedUserSpeedPercentage,
      userIsOnRoad: roundedUserIsOnRoad,
      userIsOnRoadNextSecond: roundedUserIsOnRoadNextSecond,
      isAtCrossing: roundedIsAtCrossing,
    }),
    [
      roundedRoadVisible,
      roundedVehicleVisible,
      roundedUserSpeedPercentage,
      roundedUserIsOnRoad,
      roundedUserIsOnRoadNextSecond,
      roundedIsAtCrossing,
    ],
  );

  return metrics;
}

function shape(value: number, sensitivity: number): number {
  return Math.pow(clamp(value, 0, 1), 1 / sensitivity);
}

function stabilize(value: number): number {
  return Math.round(value * 10) / 10;
}
