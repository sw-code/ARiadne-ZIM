import { useEffect, useMemo, useRef, useState } from "react";
import {
  arrayToVector3,
  asNum3,
  computeTransform,
  degreesToVector2,
  down,
  eraseY,
  Transform,
  vector2Degrees,
  viroRotationToQuaternion,
  withoutY,
} from "./math3d";
import { GeoCoordinate, geoCoordsFromGPS, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { clockDegreesToMathDegrees, mathDegreesToClockDegrees } from "../shared/math";
import { Matrix4, Vector3 } from "@math.gl/core";
import * as geomagnetism from "geomagnetism";
import { MagnetometerMeasurement } from "expo-sensors";
import { geoCoordinateToLocalPositionConverter } from "./coordinates";
import { ViroRotation } from "@reactvision/react-viro/dist/components/Types/ViroUtils";
import { DeviceProps, RouteProps, SceneProps } from "@/src/3d/components/Navigation";
import { useVisualGeopositioning } from "@/src/3d/geopose";
import { LocationObjectCoords } from "expo-location";
import { Stats } from "@/src/3d/components/overlay/Overlay";
import {
  useContinuousMedianDegrees,
  useContinuousMedianVector,
  useTimeSmoothingDegrees,
  useTimeSmoothingVector,
} from "@/src/shared/ReactExtensions";
import { GEO_POSITIONING_UPDATE_INTERVAL } from "@/App";
import { validVpsHeadingOrNull, VpsHeading } from "@/src/3d/vpsHeading";
import { accuracyOrNull, usePositioningLog } from "@/src/3d/positioningLog";

const phoneToGround = down.clone().scale(1); // assume phone is held at around 1m from ground

const intervalSeconds = GEO_POSITIONING_UPDATE_INTERVAL.seconds;

// Constructs the "north space" and provides various geo coordinates in north space.
// "North space" is a ViroNode that is rotated to magnetic north,
// and translated to the reference geo origin (the first geo measurement).
// This space is dynamic and will update as the user moves around.
// All geo objects should be placed as children of this node, using their local geo coordinates (relative to the geo origin).
// Note that the north space does not rotate as the user rotates the phone, only as the compass heading changes.
//
// ```
// ViroARScene
// |-> LatestGeoMeasurement
//     |-> NorthSpace (rotated to north, shifted to reference geo origin)
//         |-> GeoObjects (placed at local geo coordinates relative to geo origin)
// ```
//
// The ViroARScene root node position always stays fixed in the physical world.
// In the ViroScene we have a child node that represents the last geo measurement,
// and inside that we have a child node rotated to north and shifted such that the child node represents the geo origin.
export function useNorthSpace(scene: SceneProps, device: DeviceProps, routing: RouteProps) {
  const { northSpaceTransform, worldToNorthSpace, northSpaceToWorld, geoToLocal, stats } = useNorthSpaceTransforms(
    device,
    scene,
  );

  const destinationPositionInNorthSpace = useMemo(() => {
    const localCoord = geoToLocal(routing.destinationCoordinate);
    // erase height information for now, as GPS might be too inaccurate
    return eraseY(localCoord);
  }, [geoToLocal, routing.destinationCoordinate]);

  const path = routing.path;
  const deviceAltitude = device.geoLocation.altitude || 0;

  const pathInNorthSpace = useMemo(() => {
    if (path) return routeToLocalPath(path.points.coordinates, deviceAltitude, geoToLocal);
    else return null;
  }, [path, deviceAltitude, geoToLocal]);

  const cameraPositionInNorthSpace = useMemo(
    () => arrayToVector3(device.camera.viroTransform.position).transformAsPoint(worldToNorthSpace),
    [device.camera.viroTransform.position, worldToNorthSpace],
  );

  return useMemo(
    () => ({
      transform: northSpaceTransform,
      worldToNorthSpace,
      northSpaceToWorld,
      destination: destinationPositionInNorthSpace,
      cameraPosition: cameraPositionInNorthSpace,
      path: pathInNorthSpace,
      stats,
      geoToLocal,
    }),
    [
      northSpaceTransform,
      worldToNorthSpace,
      northSpaceToWorld,
      destinationPositionInNorthSpace,
      cameraPositionInNorthSpace,
      pathInNorthSpace,
      stats,
      geoToLocal,
    ],
  );
}

export function useNorthSpaceTransforms(device: DeviceProps, scene: SceneProps) {
  const { geoLocation, magneticMeasurement, camera } = device;

  // this ref is used to tell the linter that it should not be a dependency on purpose
  // because we must not update the worldNorthHeading just because the camera changed!
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // the absolute origin that will be used to place all geo-objects (it will never change)
  const [geoOrigin] = useState<LocationObjectCoords>(geoLocation);
  // const [geoOriginInWorld] = useState<Vector3>(Vector3.ZERO);

  const [latestGeoMeasurement, setLatestGeoMeasurement] = useState<LocationObjectCoords>(geoLocation);
  const [latestGeoMeasurementInWorld, setLatestGeoMeasurementInWorld] = useState<Vector3>(
    arrayToVector3(camera.viroTransform.position),
  );

  // when geo location changes, update the current camera position at that time
  useEffect(() => {
    setLatestGeoMeasurementInWorld(arrayToVector3(cameraRef.current.viroTransform.position));
    setLatestGeoMeasurement(geoLocation);
  }, [geoLocation]);

  const [latestVisualMeasurement, vpsError] = useVisualGeopositioning(
    scene.sceneNavigator,
    device.geoLocation,
    intervalSeconds,
    () => cameraRef.current,
  );

  const compassWorldNorth = useMemo(() => {
    return computeCompassWorldHeading(
      magneticMeasurement,
      cameraRef.current.localToParent,
      geoCoordsFromGPS(geoOrigin),
    );
  }, [magneticMeasurement, geoOrigin]);

  const visualWorldNorth = useMemo(
    () =>
      latestVisualMeasurement &&
      computeWorldHeadingFromUserHeading(latestVisualMeasurement.pose.heading, latestVisualMeasurement.camera),
    [latestVisualMeasurement],
  );

  const nowSeconds = useRef(scene.time.nowSeconds);
  nowSeconds.current = scene.time.nowSeconds;
  const [latestVpsHeading, setLatestVpsHeading] = useState<VpsHeading | null>(null);

  useEffect(() => {
    if (!latestVisualMeasurement || visualWorldNorth === undefined) return;

    setLatestVpsHeading({
      worldNorthDegrees: visualWorldNorth,
      yawAccuracyDegrees: accuracyOrNull(latestVisualMeasurement.pose.orientationYawAccuracy),
      measuredAtSeconds: nowSeconds.current,
    });
  }, [latestVisualMeasurement, visualWorldNorth]);

  const heldVpsHeading = validVpsHeadingOrNull(latestVpsHeading, scene.time.nowSeconds);

  const [latestGeoCoord, latestGeoHeading, latestGeoCoordInWorld, stats] = useMemo(() => {
    const visualAccuracy = accuracyOrNull(latestVisualMeasurement?.pose.horizontalAccuracy);
    const visualHeadingAccuracyDegrees = accuracyOrNull(latestVisualMeasurement?.pose.orientationYawAccuracy);
    const gpsAccuracy = accuracyOrNull(latestGeoMeasurement?.accuracy);
    const compassAccuracyDegrees = 45;

    if (latestVisualMeasurement && visualWorldNorth !== undefined) {
      const { pose, camera } = latestVisualMeasurement;
      return [
        geoCoordsFromLatLongDegrees(pose.latitude, pose.longitude, pose.altitude),
        visualWorldNorth,
        arrayToVector3(camera.viroTransform.position),
        {
          geoAccuracyRadiusMeters: visualAccuracy,
          geoTracking: "VPS",
          compassAccuracyDegrees: visualHeadingAccuracyDegrees,
          vpsUnavailableReason: null,
        } satisfies Omit<Stats, "framerate">,
      ];
    }

    return [
      geoCoordsFromGPS(latestGeoMeasurement),
      heldVpsHeading?.worldNorthDegrees ?? compassWorldNorth,
      latestGeoMeasurementInWorld,
      {
        geoAccuracyRadiusMeters: gpsAccuracy,
        geoTracking: heldVpsHeading ? "GPS & VPS heading" : "GPS & Compass",
        compassAccuracyDegrees: heldVpsHeading ? heldVpsHeading.yawAccuracyDegrees : compassAccuracyDegrees,
        vpsUnavailableReason: vpsError,
      } satisfies Omit<Stats, "framerate">,
    ];
  }, [
    latestVisualMeasurement,
    visualWorldNorth,
    heldVpsHeading,
    latestGeoMeasurement,
    compassWorldNorth,
    latestGeoMeasurementInWorld,
    vpsError,
  ]);

  const worldNorthRotationMedian = useContinuousMedianDegrees(latestGeoHeading, intervalSeconds, 32, scene.time);
  const worldNorthRotation = useTimeSmoothingDegrees(worldNorthRotationMedian, 12, scene.time);

  // converts geo coords to a local viro coordinate, relative to the absolute geoOrigin which never changes
  const geoToLocal = useMemo(() => geoCoordinateToLocalPositionConverter(geoCoordsFromGPS(geoOrigin)), [geoOrigin]);

  const [rawNorthSpacePosition, northSpaceRotation] = useMemo<[Vector3, ViroRotation]>(() => {
    const northRotation: ViroRotation = [0, worldNorthRotation, 0];
    const newMeasurementInNorthSpace = eraseY(geoToLocal(latestGeoCoord));
    const newMeasurementInWorld = latestGeoCoordInWorld.clone().add(phoneToGround);

    const toOriginInNorthSpace = newMeasurementInNorthSpace.clone().negate();
    toOriginInNorthSpace.transformByQuaternion(viroRotationToQuaternion([0, worldNorthRotation, 0])); // TODO negate?  // TODO optimize by using rotateY?
    const northSpacePosition = newMeasurementInWorld.clone().add(toOriginInNorthSpace);

    return [northSpacePosition, northRotation];
  }, [geoToLocal, latestGeoCoord, latestGeoCoordInWorld, worldNorthRotation]);

  const medianNorthSpacePosition = useContinuousMedianVector(rawNorthSpacePosition, intervalSeconds, 32, scene.time);
  const northSpacePosition = useTimeSmoothingVector(medianNorthSpacePosition, 12, scene.time);

  usePositioningLog({
    time: scene.time,
    geoOrigin,
    gpsFix: geoLocation,
    arcoreFix: latestVisualMeasurement ?? null,
    arcoreWorldNorthDegrees: visualWorldNorth ?? null,
    compassWorldNorthDegrees: compassWorldNorth,
    northSpacePositionInWorld: northSpacePosition,
    worldNorthDegrees: worldNorthRotation,
    geoTracking: stats.geoTracking,
    readCamera: () => cameraRef.current,
  });

  const northSpaceTransform = useMemo(
    () => computeTransform({ position: asNum3(northSpacePosition), rotation: northSpaceRotation }),
    [northSpacePosition, northSpaceRotation],
  );

  const worldToNorthSpace = northSpaceTransform.parentToLocal;
  const northSpaceToWorld = northSpaceTransform.localToParent;

  return useMemo(
    () => ({
      northSpaceTransform,
      worldToNorthSpace,
      northSpaceToWorld,
      geoToLocal,
      stats,
    }),
    [northSpaceTransform, worldToNorthSpace, northSpaceToWorld, geoToLocal, stats],
  );
}

function computeWorldHeadingFromUserHeading(userGeoHeading: number, camera: Transform) {
  // TODO can this not be simplified to this?
  // const userWorldHeading = camera.viroTransform.rotation[1];
  // return -userGeoHeading - userWorldHeading;
  const deviceNorthVec2D = degreesToVector2(clockDegreesToMathDegrees(userGeoHeading));
  const deviceNorthVec = new Vector3(deviceNorthVec2D.x, 0, deviceNorthVec2D.y);
  const worldNorthVec = deviceNorthVec.clone().transformAsVector(camera.localToParent);
  return mathDegreesToClockDegrees(vector2Degrees(withoutY(worldNorthVec)));
}

export function computeCompassWorldHeading(
  compass: MagnetometerMeasurement,
  cameraToWorld: Matrix4,
  atGeoLocation: GeoCoordinate | null,
) {
  // viro has -z forward, compass has +z forward, so one would expect negation to be necessary.
  // but for some reason, flipping the z sign makes the camera-attached polyline incorrect
  const deviceNorthVec = new Vector3(compass.x, compass.y, compass.z).normalize();

  // we would expect to use the inverse of the camera rotation here,
  // but for some reason, it only works like this...
  const worldNorthVec = deviceNorthVec.clone().transformAsVector(cameraToWorld);

  // one would expect all the inversions to cancel out, but for some reason,
  // it only works exactly like this...
  let worldHeading = mathDegreesToClockDegrees(vector2Degrees(withoutY(worldNorthVec)));

  // correct the heading from the measured magnetic north to the known cartographic north,
  // based on the geo location of the compass
  // (we don't account for the latest user movement, as this does not need to be precise)
  if (atGeoLocation !== null) {
    const latLonLocation = [atGeoLocation.latitudeDegrees, atGeoLocation.longitudeDegrees];

    if (atGeoLocation.altitudeMetersFromEllipsoid)
      latLonLocation.push(atGeoLocation.altitudeMetersFromEllipsoid / 1000); // uses KM

    const magneticOffsetAtLocation = geomagnetism.model().point(latLonLocation); // uses current date
    const degreesToTrueNorth = magneticOffsetAtLocation.decl;
    worldHeading += degreesToTrueNorth;
  }

  return 180 + worldHeading;
}

function routeToLocalPath(
  coords: [number, number][],
  altitude: number,
  geoToLocal: (pointOfInterest: GeoCoordinate) => Vector3,
): Vector3[] {
  return coords.map(([lonDeg, latDeg]) => {
    const geoCoord = geoCoordsFromLatLongDegrees(latDeg, lonDeg, altitude);
    // erase height information for now, as GPS might be too inaccurate
    return eraseY(geoToLocal(geoCoord));
  });
}
