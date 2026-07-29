import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroCameraTransform,
  ViroNode,
  ViroTrackingReason,
  ViroTrackingStateConstants,
} from "@reactvision/react-viro";
import { Stage } from "../components/overlay/Loading3dHint";
import { computeTransform, identityTransform } from "../math3d";
import { GeoCoordinate, geoCoordsFromGPS, useGeoLocation } from "@/src/shared/GeoLocation";
import { useMagnetometer } from "../../shared/Magnetometer";
import {
  currentAbsoluteTime,
  Listener,
  useIntervalAsync,
  useLatest,
  useRefLazy,
  useRenderRateLog,
} from "@/src/shared/ReactExtensions";
import { Navigation } from "../components/Navigation";
import { useRouting } from "@/src/3d/routing";
import { Stats } from "@/src/3d/components/overlay/Overlay";
import { useAnimationFrameLoop } from "react-timing-hooks";
import { SceneVision, useSemanticDangerRecognition } from "@/src/3d/vision";
import { DangerMetrics } from "@/src/3d/danger";
import { useAnchorsState, ViroArSceneProps } from "@/src/shared/Viro";
import { secondsToMillis } from "@/src/shared/math";
import { enumerate, promiseWithResolvers } from "@/src/shared/JavascriptExtensions";
import { getRoadsWithWidth } from "@/src/ui/pages/OverpassService";
import { log } from "@/src/shared/Logger";
import { PointOfInterest } from "@/src/shared/poi";
import { LocationObjectCoords } from "expo-location";
import { GEO_POSITIONING_UPDATE_INTERVAL } from "@/App";
import type { NavigationMode } from "@/App";
import { queuePermissionRequest } from "@/src/shared/permissions";
import { useUserProfile } from "@/src/shared/UserProfileProvider";
import { createWalkEncounters } from "@/src/3d/walkEncounters";
import { useWalkRecording } from "@/src/3d/useWalkRecording";

/// Passed into navigator
type ArViewProps = {
  onStageChanged: Listener<Stage>;
  targetCoordinate: GeoCoordinate;
  onStatsChanged: Listener<Stats>;
  onDangerStatusChanged: Listener<DangerMetrics>;
  onVisionChanged: Listener<SceneVision>;
  routeIntersections: GeoCoordinate[];
  pois: PointOfInterest[];
  via: PointOfInterest | null;
  navigationMode: NavigationMode;
  navigator: "line" | "dog";
  onPlaceSelected: (poi: PointOfInterest, userLocation: LocationObjectCoords | null) => void;
};

/// Passed from navigator to scene
type ArSceneProps = ArViewProps & {};

const viroCameraPermissionRequestPromise = promiseWithResolvers<void>();
const nearbyStreetsQueryIntervalSeconds = 3 * 60;

const mainSceneInitialScene = {
  scene: (viroProps?: any) => <MainScene {...viroProps} />,
};

export const MainSceneNavigator = React.memo(function MainSceneNavigator(props: ArViewProps) {
  useEffect(() => {
    void queuePermissionRequest(() => viroCameraPermissionRequestPromise.promise);
  }, []);

  const sceneProps: ArSceneProps = useMemo(
    () => ({
      onDangerStatusChanged: props.onDangerStatusChanged,
      onStageChanged: props.onStageChanged,
      onStatsChanged: props.onStatsChanged,
      onVisionChanged: props.onVisionChanged,
      navigationMode: props.navigationMode,
      navigator: props.navigator,
      onPlaceSelected: props.onPlaceSelected,
      pois: props.pois,
      via: props.via,
      routeIntersections: props.routeIntersections,
      targetCoordinate: props.targetCoordinate,
    }),
    [
      props.onDangerStatusChanged,
      props.onStageChanged,
      props.onStatsChanged,
      props.onVisionChanged,
      props.navigationMode,
      props.navigator,
      props.onPlaceSelected,
      props.pois,
      props.via,
      props.routeIntersections,
      props.targetCoordinate,
    ],
  );

  return (
    <ViroARSceneNavigator
      viroAppProps={sceneProps}
      initialScene={mainSceneInitialScene}
      style={{ flex: 1 }}
      autofocus={true}
      pbrEnabled={true}
      shadowsEnabled={true}
      provider={"arcore"}
    />
  );
});

/// Collects permissions, collects camera tracking transform, collects tracking status, maintains time state.
/// Returns (via event handlers) the condensed status enum. Only launches Navigation once all sensors are running and the scene is tracking.
function MainScene(viroProps: ViroArSceneProps<ArSceneProps>): React.JSX.Element {
  useRenderRateLog("MainScene");
  const arSceneNavigator = viroProps.arSceneNavigator;
  const props = arSceneNavigator.viroAppProps;

  const { onStageChanged, onVisionChanged, onPlaceSelected, targetCoordinate, via } = props;
  const shouldShowPointsOfInterest = props.navigationMode === "explore";

  // One per AR session. The profile changes with every count it records, so the encounters read it through a
  // ref: recreating them on such a change would forget which places this walk already counted.
  const profile = useUserProfile();
  const profileRef = useLatest(profile);
  const encounters = useRefLazy(() =>
    createWalkEncounters({
      recordShown: (poi) => profileRef.current.recordShown(poi),
      recordEngaged: (poi) => profileRef.current.recordEngaged(poi),
    }),
  ).current;

  const [isTracking, setTracking] = useState(false);
  const isTrackingRef = useRef(isTracking);
  const pointsOfInterest = useMemo(
    () => (shouldShowPointsOfInterest ? props.pois : []),
    [shouldShowPointsOfInterest, props.pois],
  );
  const [sceneVision, setSceneVision] = useState<SceneVision>(null);

  const [currentTime, setTime] = useState(currentAbsoluteTime());

  const [cameraTransform, setCameraTransform] = useState(identityTransform());

  const [deviceGeoLocation, gpsError, hasGeoPermission] = useGeoLocation(
    true,
    GEO_POSITIONING_UPDATE_INTERVAL.seconds,
    1,
    true,
  );

  // Read through a ref, so the handler handed to the places stays the same while the GPS fix changes.
  const deviceGeoLocationRef = useLatest(deviceGeoLocation);
  const handlePlaceSelected = useCallback(
    (poi: PointOfInterest) => onPlaceSelected(poi, deviceGeoLocationRef.current),
    [onPlaceSelected, deviceGeoLocationRef],
  );

  const [magnetometer, hasCompassPermission] = useMagnetometer(true, GEO_POSITIONING_UPDATE_INTERVAL.seconds);

  useWalkRecording({
    location: deviceGeoLocation,
    isArTracking: isTracking,
    pois: pointsOfInterest,
    encounters,
    navigationMode: props.navigationMode,
  });

  const userCoords = deviceGeoLocation && geoCoordsFromGPS(deviceGeoLocation);
  const routing = useRouting(userCoords, targetCoordinate, via?.location.coordinate ?? null);

  const handleVisionChanged = useCallback(
    (nextVision: SceneVision) => {
      setSceneVision((currentVision) => (areSceneVisionEqual(currentVision, nextVision) ? currentVision : nextVision));
      onVisionChanged(nextVision);
    },
    [onVisionChanged],
  );

  useSemanticDangerRecognition(arSceneNavigator, handleVisionChanged);

  const currentStage: Stage = (() => {
    if (!isTracking) return "not-tracking";
    if (!hasCompassPermission || !hasGeoPermission) return "permission-denied";
    if (routing.error) return "loading-route";
    if (gpsError !== null) return "gps-lost";
    return "running";
  })();

  useEffect(() => onStageChanged(currentStage), [currentStage, onStageChanged]);

  function onTrackingUpdated(state: any, _: ViroTrackingReason) {
    const nextIsTracking = state === ViroTrackingStateConstants.TRACKING_NORMAL;
    if (isTrackingRef.current !== nextIsTracking) {
      isTrackingRef.current = nextIsTracking;
      log.info("AR MAIN | Tracking changed", { state, isTracking: nextIsTracking });
      setTracking(nextIsTracking);
    }

    // this is needed because viro requests camera permission, and we must never request some other permission at the same time
    viroCameraPermissionRequestPromise.resolve();
  }

  function onCameraTransformChanged(cameraTransform: ViroCameraTransform) {
    setCameraTransform(
      computeTransform({
        position: [...cameraTransform.position],
        rotation: [...cameraTransform.rotation],
      }),
    );
  }

  useAnimationFrameLoop(
    () => {
      setTime(currentAbsoluteTime());
    },
    { startOnMount: true },
  );

  const [streets, streetError] = useIntervalAsync(
    async () => {
      log.info("OVERPASS | Requesting nearby streets...");

      const roads = deviceGeoLocation && (await getRoadsWithWidth(geoCoordsFromGPS(deviceGeoLocation), 200));

      return roads?.flatMap((road) => {
        return enumerate(road.centerLine.length - 1).map((coordinateIndex) => {
          const start = road.centerLine[coordinateIndex]!;
          const end = road.centerLine[coordinateIndex + 1]!;

          return {
            start,
            end,
            width: road.width,
          };
        });
      });
    },
    secondsToMillis(nearbyStreetsQueryIntervalSeconds),
    [deviceGeoLocation],
  );

  const { anchors, onAnchorFound, onAnchorUpdated, onAnchorRemoved } = useAnchorsState();

  const device = useMemo(
    () =>
      deviceGeoLocation &&
      magnetometer && { geoLocation: deviceGeoLocation, magneticMeasurement: magnetometer, camera: cameraTransform },
    [cameraTransform, deviceGeoLocation, magnetometer],
  );

  const scene = useMemo(
    () => ({
      anchors,
      time: currentTime,
      sceneNavigator: arSceneNavigator,
      vision: sceneVision,
      pois: pointsOfInterest,
      via,
    }),
    [anchors, currentTime, arSceneNavigator, sceneVision, pointsOfInterest, via],
  );

  const navigation = isTracking && device && (
    <Navigation
      scene={scene}
      device={device}
      routing={routing}
      geoInfo={{ routeIntersections: props.routeIntersections, allStreets: streets && !streetError ? streets : [] }}
      onStatsChanged={props.onStatsChanged}
      onDangerStatusChanged={props.onDangerStatusChanged}
      navigator={props.navigator}
      encounters={encounters}
      onPlaceSelected={handlePlaceSelected}
    />
  );

  return (
    <ViroARScene
      onTrackingUpdated={onTrackingUpdated}
      onCameraTransformUpdate={onCameraTransformChanged}
      onAnchorFound={onAnchorFound}
      onAnchorUpdated={onAnchorUpdated}
      onAnchorRemoved={onAnchorRemoved}
    >
      <ViroNode>{navigation}</ViroNode>
    </ViroARScene>
  );
}

function areSceneVisionEqual(a: SceneVision, b: SceneVision): boolean {
  return a === b || (!!a && !!b && a.road === b.road && a.vehicle === b.vehicle);
}
