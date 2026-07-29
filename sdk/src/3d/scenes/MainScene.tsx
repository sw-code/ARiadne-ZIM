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
import { currentAbsoluteTime, Listener, useIntervalAsync, useRenderRateLog } from "@/src/shared/ReactExtensions";
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
import { fetchAnnotatedPointsOfInterest } from "@/src/shared/AnnotatedPoiService";
import { log } from "@/src/shared/Logger";
import { PointOfInterest } from "@/src/shared/poi";
import { GEO_POSITIONING_UPDATE_INTERVAL } from "@/App";
import type { NavigationMode } from "@/App";
import { queuePermissionRequest } from "@/src/shared/permissions";
import { useTranslations } from "@/src/i18n/Translations";

/// Passed into navigator
type ArViewProps = {
  onStageChanged: Listener<Stage>;
  targetCoordinate: GeoCoordinate;
  onStatsChanged: Listener<Stats>;
  onDangerStatusChanged: Listener<DangerMetrics>;
  onVisionChanged: Listener<SceneVision>;
  routeIntersections: GeoCoordinate[];
  pois: PointOfInterest[];
  navigationMode: NavigationMode;
  navigator: "line" | "dog";
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
      pois: props.pois,
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
      props.pois,
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

  const { onStageChanged, onVisionChanged, targetCoordinate } = props;
  const t = useTranslations();
  const shouldShowPointsOfInterest = props.navigationMode === "explore";

  const [isTracking, setTracking] = useState(false);
  const isTrackingRef = useRef(isTracking);
  const [pointsOfInterest, setPointsOfInterest] = useState(() => (shouldShowPointsOfInterest ? props.pois : []));
  const [sceneVision, setSceneVision] = useState<SceneVision>(null);

  const [currentTime, setTime] = useState(currentAbsoluteTime());

  const [cameraTransform, setCameraTransform] = useState(identityTransform());

  const [deviceGeoLocation, gpsError, hasGeoPermission] = useGeoLocation(
    true,
    GEO_POSITIONING_UPDATE_INTERVAL.seconds,
    1,
    true,
  );

  const [magnetometer, hasCompassPermission] = useMagnetometer(true, GEO_POSITIONING_UPDATE_INTERVAL.seconds);

  const userCoords = deviceGeoLocation && geoCoordsFromGPS(deviceGeoLocation);
  const routing = useRouting(userCoords, targetCoordinate);

  const handleVisionChanged = useCallback(
    (nextVision: SceneVision) => {
      setSceneVision((currentVision) => (areSceneVisionEqual(currentVision, nextVision) ? currentVision : nextVision));
      onVisionChanged(nextVision);
    },
    [onVisionChanged],
  );

  useSemanticDangerRecognition(arSceneNavigator, handleVisionChanged);

  const hasRequestedPointsOfInterest = useRef(false);
  useEffect(() => {
    let isMounted = true;

    if (!shouldShowPointsOfInterest || hasRequestedPointsOfInterest.current) {
      return;
    }

    hasRequestedPointsOfInterest.current = true;
    log.info("AR MAIN | Fetching annotated points of interest");

    fetchAnnotatedPointsOfInterest(t.poiSubtypes)
      .then((pois) => {
        if (!isMounted) return;

        log.info("AR MAIN | Points of interest fetched successfully", {
          pointOfInterestCount: pois.length,
        });
        setPointsOfInterest(pois);
      })
      .catch((error) => {
        log.error("CMS | Querying for annotated points of interest in AR failed", error);
      });

    return () => {
      isMounted = false;
    };
  }, [shouldShowPointsOfInterest, t.poiSubtypes]);

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
    }),
    [anchors, currentTime, arSceneNavigator, sceneVision, pointsOfInterest],
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
