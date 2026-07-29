import { Stage } from "../components/overlay/Loading3dHint";
import { MainSceneNavigator } from "@/src/3d/scenes/MainScene";
import React, { useCallback, useState } from "react";
import { View } from "react-native";

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
import { LocationObjectCoords } from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PointOfInterest } from "@/src/shared/poi";
import { PlaceCard, placeCardAnchor } from "@/src/ui/components/PlaceCard";
import { replaceWalkWithPreview } from "@/src/3d/pages/ArMainNavigation";

const testMode = false; // TODO proper switch somewhere

type Props = NativeStackScreenProps<ScreenParams, "ARMain">;

type SelectedPlace = { poi: PointOfInterest; userLocation: LocationObjectCoords | null };

export const ArMainPage = ({ navigation }: Props) => {
  useRenderRateLog("ArMainPage");
  useKeepAwake("AR");
  const insets = useSafeAreaInsets();

  const { pointsOfInterest, via, routeIntersections, targetCoordinate, navigationMode, navigator } =
    useRoute<RouteProp<ScreenParams, "ARMain">>().params;

  const [stage, setStage] = useState<Stage>("initializing");

  const [vision, setVision] = useState<SceneVision>(null);
  const [danger, setDanger] = useState<DangerMetrics | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

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

  const handlePlaceSelected = useCallback((poi: PointOfInterest, userLocation: LocationObjectCoords | null) => {
    setSelectedPlace({ poi, userLocation });
  }, []);

  const handleBack = () => {
    navigation.goBack();
  };

  // Replaces AR (and the preview it was started from) instead of pushing the new preview, so the walk ends the same way
  // as when leaving with Back.
  const handleNavigateHere = ({ poi, userLocation }: SelectedPlace) => {
    if (userLocation === null) return; // the card does not offer this without a location
    navigation.dispatch((state) =>
      replaceWalkWithPreview(state, { userCoordinates: userLocation, targetCoordinate: poi.location.coordinate }),
    );
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
        via={via}
        navigationMode={navigationMode}
        navigator={navigator}
        onPlaceSelected={handlePlaceSelected}
      />

      <PoiObjectDetector onDetectionsChanged={handleDetectionsChanged} />

      {/* Before the overlay, so that its danger warning covers the card. */}
      {selectedPlace && (
        <View pointerEvents="box-none" style={[placeCardAnchor, insets]}>
          <PlaceCard
            poi={selectedPlace.poi}
            canNavigateHere={selectedPlace.userLocation !== null}
            onNavigateHere={() => handleNavigateHere(selectedPlace)}
            onClose={() => setSelectedPlace(null)}
          />
        </View>
      )}

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
