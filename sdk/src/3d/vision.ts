import { secondsToMillis } from "@/src/shared/math";
import { useIntervalAsync } from "@/src/shared/ReactExtensions";
import { UntypedViroArNavigator } from "@/src/shared/Viro";
import { useEffect } from "react";

export type SceneVision = null | {
  road: number;
  vehicle: number;
};

export function useSemanticDangerRecognition(
  navigator: UntypedViroArNavigator,
  setDanger: (status: SceneVision) => void,
) {
  const [result, error] = useIntervalAsync(async () => {
    const { supported } = await navigator.isSemanticModeSupported();

    if (supported) {
      navigator.setSemanticModeEnabled(true);
    } else {
      throw new Error("Semantic mode not supported");
    }

    const roadAsync = navigator.getSemanticLabelFraction("road");
    const vehicleAsync = navigator.getSemanticLabelFraction("vehicle");
    const [road, vehicle] = await Promise.all([roadAsync, vehicleAsync] as const);
    if (road.success && vehicle.success) {
      return { road: road.fraction, vehicle: vehicle.fraction };
    } else {
      throw new Error("Failed to get semantic label fractions");
    }
  }, secondsToMillis(1));

  useEffect(() => {
    if (result && !error) {
      setDanger(result);
    } else {
      setDanger(null);
    }
  }, [result, setDanger, error]);
}
