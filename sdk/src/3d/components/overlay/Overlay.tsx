import { StyleSheet, Text, View } from "react-native";
import { Loading3dHint, Stage } from "./Loading3dHint";
import { appearance, layout } from "@/src/shared/Styles";
import { Header } from "@/src/ui/components/Header";
import React, { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SceneVision } from "@/src/3d/vision";
import { DangerMetrics, DangerReason, DangerState, summarizeDanger } from "@/src/3d/danger";
import { AppColors } from "@/src/shared/AppColors";
import Lucide from "@react-native-vector-icons/lucide";
import { Button } from "../../../ui/components/Button";
import { OverlayPortalPlaceholder } from "./OverlayPortal";
import { DetectedObject } from "@/src/3d/objectDetection";
import { Translations, useTranslations } from "@/src/i18n/Translations";
import { CheckpointButton } from "./CheckpointButton";
import { isMeasurementBuild } from "@/src/shared/Env";

export type Props = {
  overlayStage: Stage;
  stats: Stats;
  onBack: () => void;
  sceneVision: SceneVision;
  danger: DangerMetrics | null;
  detectedObjects: DetectedObject[];
};

export type Stats = {
  geoTracking: GeoTracking | null;
  geoAccuracyRadiusMeters: number | null;
  compassAccuracyDegrees: number | null;
  vpsUnavailableReason: string | null;
  framerate: number;
};

export type GeoTracking = "VPS" | "GPS & VPS heading" | "GPS & Compass";

const useDebugOverlays = __DEV__;
const showCheckpointButton = isMeasurementBuild();
const showDangerOverlay = true;

export function ArOverlay({ overlayStage, onBack, stats, danger, detectedObjects }: Props) {
  const insets = useSafeAreaInsets();
  const t = useTranslations();

  const { geoTracking, geoAccuracyRadiusMeters, vpsUnavailableReason, compassAccuracyDegrees } = stats;
  const accuracyVal = geoAccuracyRadiusMeters !== null ? `${geoAccuracyRadiusMeters.toFixed(2)}m` : `unknown`;
  const accuracyDegVal = compassAccuracyDegrees !== null ? `${compassAccuracyDegrees.toFixed(2)}°` : `unknown`;
  const accuracyHint = `${geoTracking} @ ~${accuracyVal} ${accuracyDegVal}`;

  const dangerState: DangerState = useMemo(
    () => (danger && summarizeDanger(danger)) ?? { variant: "no danger" },
    [danger],
  );

  let dangerWarning = (
    <>
      {(dangerState.variant === "danger" || dangerState.variant === "possible danger") && showDangerOverlay && (
        <>
          <View
            style={{
              ...layout.fullSize,
              backgroundColor: AppColors.OverlayErrorBackdrop,
              pointerEvents: "none",
            }}
          />
          <View
            style={{
              ...layout.fullSize,
              ...insets,
              ...layout.centeredColumn,
            }}
          >
            <View
              style={{ ...layout.spacing10, ...appearance.card, backgroundColor: AppColors.OverlayErrorBackground }}
            >
              <Text
                style={{
                  ...appearance.text,
                  color: AppColors.OverlayErrorForeground,
                  textTransform: "uppercase",
                  fontWeight: "bold",
                }}
              >
                {t.danger.title}
              </Text>
              <Text style={{ ...appearance.text, color: AppColors.OverlayErrorForeground, textTransform: "uppercase" }}>
                {describeDangerReason(dangerState.reason, t.danger)}
              </Text>
            </View>
          </View>
        </>
      )}
    </>
  );

  const debugStats = (
    <>
      {useDebugOverlays && (
        <View
          pointerEvents="box-none"
          style={{
            ...layout.fullSize,
            ...insets,
            ...layout.centeredColumn,
            ...layout.spacing10,
            alignItems: "flex-end",
            alignContent: "flex-end",
            justifyContent: "flex-end",
          }}
        >
          <View style={{ ...layout.spacing10, ...appearance.card }}>
            <Text style={appearance.text}>{stats.framerate.toFixed(1) + " FPS"}</Text>
          </View>

          {danger && (
            <View style={{ ...layout.spacing10, ...appearance.card, minWidth: 220 }}>
              <DangerMetricsDisplay metrics={danger} />
            </View>
          )}

          <View style={{ ...layout.spacing10, ...appearance.card }}>
            {vpsUnavailableReason && <Text style={appearance.text}>{vpsUnavailableReason}</Text>}
            <Text style={appearance.text}>{accuracyHint}</Text>
          </View>
        </View>
      )}
    </>
  );

  const [showSafety, setShowSafety] = useState(true);

  const safetyOverlay = (
    <>
      {showSafety && (
        <View
          style={{
            ...layout.fullSize,
            backgroundColor: AppColors.DefaultBackground,
          }}
        >
          <View style={{ ...layout.fullSize, ...layout.centeredColumn, ...layout.spacing10 }}>
            <View style={{ ...appearance.card, ...appearance.error, ...layout.spacing10, width: "60%" }}>
              <Lucide name={"triangle-alert"} size={40} color={AppColors.ErrorForeground} />
              <Text
                style={{
                  ...appearance.text,
                  fontWeight: "bold",
                  color: appearance.error.color,
                }}
              >
                {t.safetyNotice.payAttention}
              </Text>
              <Text
                style={{
                  ...appearance.text,
                  color: appearance.error.color,
                }}
              >
                {t.safetyNotice.superviseChildren}
              </Text>
              <Button
                title={t.safetyNotice.confirm}
                onPress={() => setShowSafety(false)}
                variant={"primary"}
                endIcon="check"
              />
            </View>
          </View>
        </View>
      )}
    </>
  );

  // The full-size wrappers below are box-none because a plain View takes every touch in its area, so the AR view
  // underneath would never see a tap on a place.
  return (
    <>
      <View pointerEvents="box-none" style={{ ...layout.fullSize }}>
        <DetectedObjectBoxes objects={detectedObjects} />
        {debugStats}

        <View
          pointerEvents="box-none"
          style={{
            ...layout.fullSize,
            ...insets,
            ...layout.centeredColumn,
          }}
        >
          <OverlayPortalPlaceholder />
        </View>

        <View
          pointerEvents="box-none"
          style={{
            ...layout.fullSize,
            ...insets,
            ...layout.centeredColumn,
          }}
        >
          <Loading3dHint stage={overlayStage} />
        </View>

        {showCheckpointButton && (
          <View
            pointerEvents="box-none"
            style={{
              ...layout.fullSize,
              ...insets,
              ...layout.spacing10,
              justifyContent: "flex-end",
              alignItems: "flex-start",
            }}
          >
            <CheckpointButton />
          </View>
        )}

        {safetyOverlay}
        {dangerWarning}

        <Header onBack={onBack} />
      </View>
    </>
  );
}

function describeDangerReason(reason: DangerReason, texts: Translations["danger"]): string {
  return "dominantCause" in reason
    ? texts.dominantCauses[reason.dominantCause]
    : texts.severalCauses(reason.causes.map((cause) => texts.causes[cause]));
}

const METRIC_LABELS: Record<keyof DangerMetrics, string> = {
  roadVisible: "Road Visible",
  vehicleVisible: "Vehicle Visible",
  userSpeedPercentage: "User Speed",
  userIsOnRoad: "On Road",
  userIsOnRoadNextSecond: "Approaching Road",
  isAtCrossing: "At Crossing",
};

const METRIC_ORDER: (keyof DangerMetrics)[] = [
  "roadVisible",
  "vehicleVisible",
  "userSpeedPercentage",
  "userIsOnRoad",
  "userIsOnRoadNextSecond",
  "isAtCrossing",
];

function MetricBar({ label, value }: { label: string; value: number }) {
  const clampedValue = Math.max(0, Math.min(1, value));
  const percentage = (clampedValue * 100).toFixed(0);

  return (
    <View style={metricStyles.metricRow}>
      <Text style={metricStyles.label}>{label}</Text>
      <View style={metricStyles.barContainer}>
        <View style={[metricStyles.barFill, { width: `${clampedValue * 100}%` }]} />
      </View>
      <Text style={metricStyles.value}>{percentage}%</Text>
    </View>
  );
}

function DangerMetricsDisplay({ metrics }: { metrics: DangerMetrics }) {
  return (
    <View style={metricStyles.container}>
      {METRIC_ORDER.map((key) => (
        <MetricBar key={key} label={METRIC_LABELS[key]} value={metrics[key]} />
      ))}
    </View>
  );
}

/// Must cover exactly the AR view, because the screen bounding boxes are relative to its camera preview.
function DetectedObjectBoxes({ objects }: { objects: DetectedObject[] }) {
  return (
    <View pointerEvents="none" style={layout.fullSize}>
      {objects.map(
        ({ label, confidence, screenBoundingBox: box }, index) =>
          box && (
            <View
              key={index}
              style={{ ...detectionStyles.box, left: box.x, top: box.y, width: box.width, height: box.height }}
            >
              <Text style={detectionStyles.label}>{`${label} ${(confidence * 100).toFixed(0)}%`}</Text>
            </View>
          ),
      )}
    </View>
  );
}

const detectionStyles = StyleSheet.create({
  box: {
    position: "absolute",
    borderWidth: 2,
    borderColor: AppColors.SuccessForeground,
  },
  label: {
    alignSelf: "flex-start",
    fontSize: 10,
    color: AppColors.GlassForeground,
    backgroundColor: AppColors.SuccessForeground,
  },
});

const metricStyles = StyleSheet.create({
  container: {
    gap: 4,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    width: 110,
    fontSize: 10,
    color: AppColors.DefaultForeground,
  },
  barContainer: {
    flex: 1,
    height: 8,
    backgroundColor: AppColors.ButtonSecondaryBackground,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: AppColors.ErrorForeground,
    borderRadius: 4,
  },
  value: {
    width: 32,
    fontSize: 10,
    textAlign: "right",
    color: AppColors.DefaultForeground,
  },
});
