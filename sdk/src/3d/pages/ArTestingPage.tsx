import { Stage } from "../components/overlay/Loading3dHint";
import React, { useState } from "react";
import { ArOverlay, Stats } from "../components/overlay/Overlay";
import { RouteProp, useRoute } from "@react-navigation/native";
import { ScreenParams } from "@/App";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useKeepAwake } from "expo-keep-awake";
import { TestingSceneNavigator } from "@/src/3d/scenes/TestingScene";
import { OverlayPortalProvider } from "@/src/3d/components/overlay/OverlayPortal";

type Props = NativeStackScreenProps<ScreenParams, "ARTesting">;

export const ArTestingPage = ({ navigation }: Props) => {
  useKeepAwake("AR");

  const { pointsOfInterest } = useRoute<RouteProp<ScreenParams, "ARTesting">>().params;

  const [stage, setStage] = useState<Stage>("initializing");

  const [stats, setStats] = useState<Stats>({
    geoTracking: null,
    geoAccuracyRadiusMeters: null,
    vpsUnavailableReason: null,
    compassAccuracyDegrees: null,
    framerate: 0,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <OverlayPortalProvider>
      <TestingSceneNavigator onStageChanged={setStage} onStatsChanged={setStats} pois={pointsOfInterest} />
      <ArOverlay
        overlayStage={stage}
        onBack={handleBack}
        stats={stats}
        sceneVision={null}
        danger={null}
        detectedObjects={[]}
      />
    </OverlayPortalProvider>
  );
};
