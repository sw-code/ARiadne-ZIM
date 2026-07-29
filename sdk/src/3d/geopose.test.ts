import { GeospatialNavigator, getGeopositionAsync } from "@/src/3d/geopose";
import { ViroGeospatialPose } from "@reactvision/react-viro";
import { LocationObjectCoords } from "expo-location";
import { computeTransform } from "@/src/3d/math3d";

jest.mock("expo-location", () => ({
  getProviderStatusAsync: async () => ({ locationServicesEnabled: true, networkAvailable: true }),
  getForegroundPermissionsAsync: async () => ({
    status: "granted",
    granted: true,
    canAskAgain: true,
    expires: "never",
    android: { accuracy: "fine" },
  }),
}));

jest.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

const deviceLocation: LocationObjectCoords = {
  latitude: 53.55,
  longitude: 9.99,
  altitude: 40,
  accuracy: 8,
  altitudeAccuracy: 3,
  heading: null,
  speed: null,
};

const pose: ViroGeospatialPose = {
  latitude: 53.55,
  longitude: 9.99,
  altitude: 40,
  heading: 90,
  quaternion: [0, 0, 0, 1],
  horizontalAccuracy: 1.5,
  verticalAccuracy: 2,
  headingAccuracy: 3,
  orientationYawAccuracy: 3,
};

// The VPS availability check is a network request, during which a walking user moves on.
test("pairs the geospatial pose with the camera read right before it, after the VPS availability check", async () => {
  const events: string[] = [];
  const navigator: GeospatialNavigator = {
    isGeospatialModeSupported: async () => ({ supported: true }),
    setGeospatialModeEnabled: () => {},
    checkVPSAvailability: async () => {
      events.push("VPS availability checked");
      return { availability: "Available" };
    },
    getEarthTrackingState: async () => ({ state: "Enabled" }),
    getCameraGeospatialPose: async () => {
      events.push("pose read");
      return { success: true, pose };
    },
  };

  const cameraAtPoseRead = computeTransform({ position: [1, 0, 2], rotation: [0, 0, 0] });

  const measurement = await getGeopositionAsync(navigator, deviceLocation, () => {
    events.push("camera read");
    return cameraAtPoseRead;
  });

  expect(events).toEqual(["VPS availability checked", "camera read", "pose read"]);
  expect(measurement).toEqual({ pose, camera: cameraAtPoseRead });
});
