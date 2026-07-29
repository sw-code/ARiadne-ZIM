import * as Location from "expo-location";
import { LocationAccuracy, LocationObjectCoords, LocationPermissionResponse } from "expo-location";
import { secondsToMillis } from "@/src/shared/math";
import { useEffect, useMemo, useState } from "react";
import { Listener } from "./ReactExtensions";
import { nullToUndefined } from "@/src/shared/JavascriptExtensions";
import { log } from "@/src/shared/Logger";
import { queuePermissionRequest } from "@/src/shared/permissions";
import { useTranslations } from "@/src/i18n/Translations";

export type GeoCoordinate = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeMetersFromEllipsoid?: number;
};

export function geoCoordsFromGPS(deviceLocation: LocationObjectCoords): GeoCoordinate {
  return geoCoordsFromLatLongDegrees(
    deviceLocation.latitude,
    deviceLocation.longitude,
    nullToUndefined(deviceLocation.altitude),
  );
}

export function geoCoordsFromLatLongDegrees(
  latitudeDegrees: number,
  longitudeDegrees: number,
  altitudeMetersFromEllipsoid: number = 0,
): GeoCoordinate {
  return {
    latitudeDegrees,
    longitudeDegrees,
    altitudeMetersFromEllipsoid: altitudeMetersFromEllipsoid,
  };
}

/// Users can grant approximate location only, which is too inaccurate for navigation.
export function isPreciseLocationGranted(permission: LocationPermissionResponse) {
  return permission.granted && (permission.android?.accuracy === "fine" || permission.ios?.accuracy === "full");
}

/// Requests permission if not already granted.
/// Returns [location|null, error|null, hasPermission]
export function useGeoLocation(
  active: boolean,
  intervalSeconds: number,
  intervalMeters: number,
  assumeGroundLevel: boolean,
): [LocationObjectCoords | null, string | null, boolean] {
  const t = useTranslations();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const hasPermission = permission !== null && permission.granted;
  const shouldAsk = !hasPermission && (permission == null || permission.canAskAgain);

  useEffect(() => {
    if (active && shouldAsk) {
      log.info("Requesting geo permission");

      queuePermissionRequest(() => requestPermission())
        .then(() => log.info("Got geo permission"))
        .catch((e) => log.error("Denied geo permission", e));
    }
  }, [hasPermission, requestPermission, active, shouldAsk]);

  const isActive = active && hasPermission;
  const [location, error] = useCurrentGeoLocationOrFail(isActive, intervalSeconds, intervalMeters);

  const correctedLocation = useMemo(
    () => (location && assumeGroundLevel ? { ...location, altitude: 0 } : location),
    [assumeGroundLevel, location],
  );

  if (active && !hasPermission && !shouldAsk) {
    return [null, t.location.permissionMissing, false];
  } else {
    return [correctedLocation, error, hasPermission];
  }
}

/// Does not check for permission.
/// If an error happens, the last position is kept.
/// When active is changed, all state is reset.
/// Returns the current error or nothing.
function useCurrentGeoLocationOrFail(
  active: boolean,
  intervalSeconds: number,
  intervalMeters: number,
): [LocationObjectCoords | null, string | null] {
  const [location, setLocation] = useState<LocationObjectCoords | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // when resubscribing, reset the error:
    setError(null);

    if (active) {
      const unsubscribe = watchGeoLocation(
        (coord) => {
          setLocation(coord);
          setError(null);
        },

        // on error, keep current position
        setError,

        intervalSeconds,
        intervalMeters,
      );

      // setPosition will always be identical, so no need to sync this
      return unsubscribe;
    } else {
      return undefined;
    }
  }, [active, intervalSeconds, intervalMeters]);

  return [location, error];
}

function watchGeoLocation(
  setLocation: Listener<LocationObjectCoords>,
  onError: (error: string) => void,
  intervalSeconds: number,
  intervalMeters: number,
): () => void {
  let cancelled = false;

  const subscriptionPromise = Location.watchPositionAsync(
    {
      accuracy: LocationAccuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
      timeInterval: secondsToMillis(intervalSeconds),
      distanceInterval: intervalMeters,
    },
    (update: { coords: LocationObjectCoords }) => {
      if (!cancelled) {
        setLocation(update.coords);
      }
    },
    (err) => {
      if (!cancelled) {
        onError(err);
      }
    },
  );

  async function unsubscribe() {
    cancelled = true;

    // to cancel, we first have to wait for the subscription to be created
    const subscription = await subscriptionPromise;
    subscription.remove();
  }

  // invoke async function without awaiting the result
  return () => unsubscribe();
}
