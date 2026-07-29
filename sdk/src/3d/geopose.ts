import { ViroGeospatialPose } from "@reactvision/react-viro";
import { useIntervalAsync } from "../shared/ReactExtensions";
import { secondsToMillis } from "@/src/shared/math";
import { LocationObjectCoords } from "expo-location";
import * as Location from "expo-location";
import * as Network from "expo-network";
import { UntypedViroArNavigator } from "@/src/shared/Viro";
import { queuePermissionRequest } from "@/src/shared/permissions";
import { Transform } from "@/src/3d/math3d";
import { isPreciseLocationGranted } from "@/src/shared/GeoLocation";

// TODO make this more elegant - only a callback, no return value?
export function useVisualGeopositioning(
  navigator: GeospatialNavigator,
  deviceLocation: LocationObjectCoords,
  intervalSeconds: number,
  readCamera: () => Transform,
) {
  const [pos, error] = useIntervalAsync<CameraGeospatialPose>(
    () => getGeopositionAsync(navigator, deviceLocation, readCamera),
    secondsToMillis(intervalSeconds),
  );

  const err = error ? "" + error : null;
  return [pos, err] as const;
}

export type GeospatialNavigator = Pick<
  UntypedViroArNavigator,
  | "isGeospatialModeSupported"
  | "setGeospatialModeEnabled"
  | "checkVPSAvailability"
  | "getEarthTrackingState"
  | "getCameraGeospatialPose"
>;

// The camera transform at the time the geospatial pose was read, to place the pose in the AR world.
export type CameraGeospatialPose = { pose: ViroGeospatialPose; camera: Transform };

export async function getGeopositionAsync(
  arSceneNavigator: GeospatialNavigator,
  deviceGeoLocation: LocationObjectCoords,
  readCamera: () => Transform,
): Promise<CameraGeospatialPose> {
  const gps = await Location.getProviderStatusAsync();

  if (!gps.locationServicesEnabled) {
    throw new Error("Location services disabled.");
  }

  if (!gps.networkAvailable) {
    throw new Error("Network not available.");
  }

  const locPerm = await queuePermissionRequest(() => Location.getForegroundPermissionsAsync());
  if (!isPreciseLocationGranted(locPerm)) {
    throw new Error("Geo fine permission denied.");
  }

  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || !state.isInternetReachable) {
    throw new Error("No internet connection.");
  }

  const support = await arSceneNavigator.isGeospatialModeSupported();

  if (support.supported) {
    arSceneNavigator.setGeospatialModeEnabled(true);
  } else {
    throw new Error("Geospatial positioning not supported." + errorToString(support.error));
  }

  if (deviceGeoLocation) {
    const status = await arSceneNavigator.checkVPSAvailability(deviceGeoLocation.latitude, deviceGeoLocation.longitude);

    if (status.availability === "Unavailable") {
      throw new Error("Geospatial positioning not available here." + errorToString(status.error));
    }
  }

  const tracking = await arSceneNavigator.getEarthTrackingState();

  if (tracking.state === "Stopped") {
    throw new Error("Geospatial positioning stopped." + errorToString(tracking.error));
  }

  if (tracking.state === "Paused") {
    throw new Error("Geospatial positioning paused for now." + errorToString(tracking.error));
  }

  // The checks above include network requests, during which a walking user moves on.
  const camera = readCamera();
  const geoCamera = await arSceneNavigator.getCameraGeospatialPose();

  if (geoCamera.success && geoCamera.pose) {
    return { pose: geoCamera.pose, camera };
  } else {
    if (geoCamera.error) {
      throw new Error("Geospatial camera position could not be determined" + errorToString(geoCamera.error));
    }

    throw new Error("Geospatial camera position could not be determined for unknown reasons");
  }
}

function errorToString(error: string | undefined | null): string {
  if (error) return " Due to: " + error;
  else return "";
}
