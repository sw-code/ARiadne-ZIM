import { Stage } from "../components/overlay/Loading3dHint";
import { MainSceneNavigator } from "@/src/3d/scenes/MainScene";
import React, { useCallback, useState } from "react";

import { ArOverlay, Stats } from "../components/overlay/Overlay";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ScreenParams } from "@/App";

import { TestScene } from "@/src/3d/scenes/TestScene";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DangerMetrics } from "@/src/3d/danger";
import { SceneVision } from "@/src/3d/vision";
import { DetectedObject, PoiObjectDetector } from "@/src/3d/objectDetection";
import { useKeepAwake } from "expo-keep-awake";
import { OverlayPortalProvider } from "@/src/3d/components/overlay/OverlayPortal";
import { useRenderRateLog } from "@/src/shared/ReactExtensions";

const testMode = false; // TODO proper switch somewhere

type Props = NativeStackScreenProps<ScreenParams, "ARMain">;

export const ArMainPage = ({ navigation }: Props) => {
  useRenderRateLog("ArMainPage");
  useKeepAwake("AR");

  const { pointsOfInterest, routeIntersections, targetCoordinate, navigationMode, navigator } =
    useRoute<RouteProp<ScreenParams, "ARMain">>().params;

  const [stage, setStage] = useState<Stage>("initializing");

  const [vision, setVision] = useState<SceneVision>(null);
  const [danger, setDanger] = useState<DangerMetrics | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);

  const [stats, setStats] = useState<Stats>({
    geoTracking: null,
    geoAccuracyRadiusMeters: null,
    vpsUnavailableReason: null,
    compassAccuracyDegrees: null,
    framerate: 0,
  });

  const handleStatsChanged = useCallback((nextStats: Stats) => {
    setStats((currentStats) => (areStatsEqual(currentStats, nextStats) ? currentStats : nextStats));
  }, []);

  const handleVisionChanged = useCallback((nextVision: SceneVision) => {
    setVision((currentVision) => (areSceneVisionEqual(currentVision, nextVision) ? currentVision : nextVision));
  }, []);

  const handleDangerStatusChanged = useCallback((nextDanger: DangerMetrics) => {
    setDanger((currentDanger) => (areDangerMetricsEqual(currentDanger, nextDanger) ? currentDanger : nextDanger));
  }, []);

  // the detector reports every inference, most of them empty
  const handleDetectionsChanged = useCallback((nextObjects: DetectedObject[]) => {
    setDetectedObjects((currentObjects) =>
      currentObjects.length === 0 && nextObjects.length === 0 ? currentObjects : nextObjects,
    );
  }, []);

  const handleBack = () => {
    navigation.goBack();
  };

  if (testMode) return <TestScene />;

  return (
    <OverlayPortalProvider>
      <MainSceneNavigator
        onStageChanged={setStage}
        targetCoordinate={targetCoordinate}
        onStatsChanged={handleStatsChanged}
        onDangerStatusChanged={handleDangerStatusChanged}
        onVisionChanged={handleVisionChanged}
        routeIntersections={routeIntersections}
        pois={pointsOfInterest}
        navigationMode={navigationMode}
        navigator={navigator}
      />

      <PoiObjectDetector onDetectionsChanged={handleDetectionsChanged} />

      <ArOverlay
        overlayStage={stage}
        onBack={handleBack}
        stats={stats}
        sceneVision={vision}
        danger={danger}
        detectedObjects={detectedObjects}
      />
    </OverlayPortalProvider>
  );
};

function areStatsEqual(a: Stats, b: Stats): boolean {
  return (
    a.geoTracking === b.geoTracking &&
    a.geoAccuracyRadiusMeters === b.geoAccuracyRadiusMeters &&
    a.vpsUnavailableReason === b.vpsUnavailableReason &&
    a.compassAccuracyDegrees === b.compassAccuracyDegrees &&
    a.framerate === b.framerate
  );
}

function areSceneVisionEqual(a: SceneVision, b: SceneVision): boolean {
  return a === b || (!!a && !!b && a.road === b.road && a.vehicle === b.vehicle);
}

function areDangerMetricsEqual(a: DangerMetrics | null, b: DangerMetrics): boolean {
  return (
    !!a &&
    a.roadVisible === b.roadVisible &&
    a.vehicleVisible === b.vehicleVisible &&
    a.userSpeedPercentage === b.userSpeedPercentage &&
    a.userIsOnRoad === b.userIsOnRoad &&
    a.userIsOnRoadNextSecond === b.userIsOnRoadNextSecond &&
    a.isAtCrossing === b.isAtCrossing
  );
}
