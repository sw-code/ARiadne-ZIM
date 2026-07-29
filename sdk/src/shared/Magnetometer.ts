import { secondsToMillis } from "@/src/shared/math";
import { useEffect, useState } from "react";
import { Magnetometer, MagnetometerMeasurement } from "expo-sensors";
import { Listener } from "expo-sensors/build/DeviceSensor";
import { useHookFromCallback as useHookFromCallback, Unsubscribe } from "./ReactExtensions";
import { queuePermissionRequest } from "@/src/shared/permissions";

/// Asks for permission. Returns [measurement|null, hasPermission].
export function useMagnetometer(active: boolean, intervalSeconds: number): [MagnetometerMeasurement | null, boolean] {
  const [hasSensorAndPermission, setPermission] = useState(false);
  const [measurement, setMeasurement] = useState<MagnetometerMeasurement | null>(null);

  useEffect(() => {
    void queuePermissionRequest(async () => {
      const isAvailable = await Magnetometer.isAvailableAsync();

      let hasPermission = await Magnetometer.getPermissionsAsync();

      if (!hasPermission.granted && hasPermission.canAskAgain) {
        hasPermission = await Magnetometer.requestPermissionsAsync();
      }

      setPermission(isAvailable && hasPermission.granted);
    });
  }, []);

  useEffect(() => {
    Magnetometer.setUpdateInterval(secondsToMillis(intervalSeconds));
  }, [intervalSeconds, hasSensorAndPermission, active]);

  const activeAndPermitted = active && hasSensorAndPermission;

  useHookFromCallback(activeAndPermitted, setMeasurement, subscribeToMagnetometer);

  return [measurement, hasSensorAndPermission];
}

function subscribeToMagnetometer(listener: Listener<MagnetometerMeasurement>): Unsubscribe {
  const sub = Magnetometer.addListener((magn) => {
    const isZero = magn.x === 0 && magn.y === 0 && magn.z === 0;

    if (!isZero) {
      listener(magn);
    }
  });

  return () => sub.remove();
}
