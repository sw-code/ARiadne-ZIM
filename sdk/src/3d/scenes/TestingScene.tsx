import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ViroAmbientLight,
  ViroAnchor,
  ViroARScene,
  ViroARSceneNavigator,
  ViroCameraTransform,
  ViroDirectionalLight,
  ViroNode,
  ViroPolyline,
  ViroTrackingReason,
  ViroTrackingStateConstants,
} from "@reactvision/react-viro";
import { Text } from "react-native";
import { Stage } from "../components/overlay/Loading3dHint";
import { Button } from "../../ui/components/Button";
import {
  arrayToVector3,
  asNum3Array,
  computeTransform,
  identityTransform,
  lookQuaternion,
  quaternionToViroRotation,
  Transform,
  transformedPoint3D,
  transformedVector3D,
  viroRotationToQuaternion,
} from "../math3d";
import { currentAbsoluteTime, Listener, usePointGranularity } from "@/src/shared/ReactExtensions";
import { Stats } from "@/src/3d/components/overlay/Overlay";
import { useAnimationFrameLoop } from "react-timing-hooks";
import { Anchors, useAnchorsState, ViroArSceneProps } from "@/src/shared/Viro";
import { findMinimumBy, promiseWithResolvers } from "@/src/shared/JavascriptExtensions";
import { PointOfInterest } from "@/src/shared/poi";
import { queuePermissionRequest } from "@/src/shared/permissions";
import { Vector3 } from "@math.gl/core";
import { Viro3DObject, ViroBox, ViroMaterials, ViroQuad, ViroText } from "@reactvision/react-viro";
import { asNum3, withY } from "@/src/3d/math3d";
import { AppColors } from "@/src/shared/AppColors";
import { View } from "react-native";
import { useOverlayPortal } from "@/src/3d/components/overlay/OverlayPortal";
import { appearance, layout } from "@/src/shared/Styles";

ViroMaterials.createMaterials({
  background: {
    lightingModel: "Constant",
    diffuseColor: AppColors.DefaultBackground,
    cullMode: "None",
    writesToDepthBuffer: true,
  },
  red: {
    lightingModel: "Constant",
    diffuseColor: "#ad0b0b",
    cullMode: "None",
    writesToDepthBuffer: true,
  },
  street: {
    lightingModel: "Constant",
    diffuseColor: "rgba(255,255,255,0.42)",
    cullMode: "None",
    writesToDepthBuffer: true,
  },
  blue: {
    lightingModel: "Constant",
    diffuseColor: "rgb(0,196,255)",
    cullMode: "None",
    writesToDepthBuffer: true,
  },
});

/// Passed into navigator
type ArViewProps = {
  onStageChanged: Listener<Stage>;
  onStatsChanged: Listener<Stats>;
  pois: PointOfInterest[];
};

const viroCameraPermissionRequestPromise = promiseWithResolvers<void>();

export function TestingSceneNavigator(props: ArViewProps) {
  useEffect(() => {
    void queuePermissionRequest(() => viroCameraPermissionRequestPromise.promise);
  }, []);

  const sceneProps: ArSceneProps = { ...props };
  return (
    <ViroARSceneNavigator
      viroAppProps={sceneProps}
      initialScene={{
        // we know the javascript objects exist,
        // they are just not declared yet in the public typescript definitions
        scene: (viroProps?: any) => <MainScene {...viroProps} />,
      }}
      style={{ flex: 1 }}
      autofocus={true}
      pbrEnabled={true}
      shadowsEnabled={true}
    />
  );
}

const textColor = "#444";
ViroMaterials.createMaterials({
  textBackground: {
    lightingModel: "Constant",
    diffuseColor: "#FFF",
  },
});

/// Passed from navigator to scene
type ArSceneProps = ArViewProps & {};

function MainScene(viroProps: ViroArSceneProps<ArSceneProps>): React.JSX.Element {
  const arSceneNavigator = viroProps.arSceneNavigator;
  const props = arSceneNavigator.viroAppProps;

  const { onStageChanged } = props;

  const [isTracking, setTracking] = useState(false);

  const [, setTime] = useState(currentAbsoluteTime());

  const [cameraTransform, setCameraTransform] = useState(identityTransform());

  const currentStage: Stage = (() => {
    if (!isTracking) return "not-tracking";
    return "running";
  })();

  useEffect(() => onStageChanged(currentStage), [currentStage, onStageChanged]);

  function onTrackingUpdated(state: any, _: ViroTrackingReason) {
    const isTracking = state === ViroTrackingStateConstants.TRACKING_NORMAL;
    setTracking(isTracking);

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

  const { anchors, onAnchorFound, onAnchorUpdated, onAnchorRemoved } = useAnchorsState();

  const biggestPlane = useMemo(() => findBiggestPlane(anchors), [anchors]);
  const planePos = biggestPlane && arrayToVector3(biggestPlane?.position);
  const groundY = planePos?.y;
  const defaultGroundY = -1;
  const currentGroundY = groundY ?? defaultGroundY;

  const granularUserWorldPosition = usePointGranularity(arrayToVector3(cameraTransform.viroTransform.position), 0.3);

  const worldDestination = new Vector3(0, 0, -300);
  const linePoints = [new Vector3(0, 0, 0), worldDestination];
  const line = linePoints && <ViroPolyline points={asNum3Array(linePoints)} thickness={0.2} materials={["blue"]} />;
  const sunPos = new Vector3(0, 5, 0);

  // const userToDestination = eraseY(worldDestination.clone().subtract(userPosition)).normalize();
  type CurrentMode = "Placing" | "Reviewing" | "Accepted";
  const [currentMode, setCurrentMode] = useState<CurrentMode>("Reviewing");

  const [placement, setPlacement] = useState<Transform["viroTransform"]>({ position: [0, 0, 0], rotation: [0, 0, 0] });

  const [placementAtStartOfPress, setPlacementAtStartOfPress] = useState<Transform["viroTransform"]>(placement);
  const [cameraTransformAtStartOfPress, setCameraTransformAtStartOfPress] = useState(cameraTransform);

  useEffect(() => {
    if (currentMode === "Placing") {
      function computePlacingFor(camera: Transform) {
        const forward = withY(transformedVector3D(camera.localToParent, new Vector3(0, 0, -1)), 0);
        const lookForward = lookQuaternion(forward);
        const position = withY(arrayToVector3(camera.viroTransform.position), currentGroundY);
        return [position, lookForward] as const;
      }

      const [placementPositionAtStart, placementRotationAtStart] = computePlacingFor(cameraTransformAtStartOfPress);
      const [newPlacementPosition, newPlacementRotation] = computePlacingFor(cameraTransform);
      const [translate, rotate] = [
        newPlacementPosition.clone().subtract(placementPositionAtStart),
        newPlacementRotation.clone().multiplyRight(placementRotationAtStart.invert()),
      ];

      setPlacement({
        position: asNum3(arrayToVector3(placementAtStartOfPress.position).add(translate)),
        rotation: quaternionToViroRotation(
          viroRotationToQuaternion(placementAtStartOfPress.rotation).multiplyRight(rotate),
        ),
      });
    }
  }, [cameraTransform, cameraTransformAtStartOfPress, currentGroundY, currentMode, placementAtStartOfPress]);

  const startPlacing = useCallback(
    function startPlacing() {
      setCurrentMode("Placing");
      setCameraTransformAtStartOfPress(cameraTransform);
      setPlacementAtStartOfPress(placement);
    },
    [cameraTransform, placement],
  );

  const showPlacementUI = currentMode !== "Accepted";
  const isReviewing = currentMode === "Reviewing";
  const isPlacing = currentMode === "Placing";

  const elementsToRenderInOverlayPortal = useMemo(() => {
    return (
      showPlacementUI && (
        <View
          style={{
            ...layout.fullSize,
            ...layout.centeredColumn,
            justifyContent: "flex-end",
            padding: 100,
          }}
        >
          {isPlacing && (
            <View
              style={{
                ...layout.spacing10,
                ...layout.centeredColumn,
                ...appearance.card,
              }}
            >
              <Text style={{ ...appearance.text }}>Now, move the device to adjust the positioning</Text>
            </View>
          )}

          <View
            style={{
              ...layout.spacing10,
              ...layout.centeredColumn,
            }}
          >
            {isReviewing && (
              <Button
                title={"Accept"}
                onPress={() => setCurrentMode("Accepted")}
                variant={"primary"}
                endIcon={"check"}
              />
            )}

            <Button
              title={"Hold to adjust"}
              onPressIn={startPlacing}
              onPressOut={() => setCurrentMode("Reviewing")}
              variant={"secondary"}
              size={"big"}
              startIcon={"move"}
            />
          </View>
        </View>
      )
    );
  }, [showPlacementUI, isPlacing, isReviewing, startPlacing]);

  useOverlayPortal(elementsToRenderInOverlayPortal);

  const pois = props.pois.slice(0, 3);

  const placedTransform = useMemo(() => {
    const placementOnGround = asNum3(withY(arrayToVector3(placement.position), currentGroundY));
    return computeTransform({
      position: placementOnGround,
      rotation: placement.rotation,
    });
  }, [currentGroundY, placement]);

  const userInPlacedTransform = useMemo(
    () => transformedPoint3D(placedTransform.parentToLocal, granularUserWorldPosition),
    [placedTransform, granularUserWorldPosition],
  );

  return (
    <ViroARScene
      onTrackingUpdated={onTrackingUpdated}
      onCameraTransformUpdate={onCameraTransformChanged}
      onAnchorFound={onAnchorFound}
      onAnchorUpdated={onAnchorUpdated}
      onAnchorRemoved={onAnchorRemoved}
    >
      <ViroNode visible={isTracking}>
        <ViroNode position={placedTransform.viroTransform.position} rotation={placedTransform.viroTransform.rotation}>
          {line}

          {pois.map((poi, index) => (
            <PoiView key={poi.id} poi={poi} user={userInPlacedTransform} index={index} />
          ))}

          <ViroDirectionalLight
            direction={[0, -1, 0]}
            color="#f7e6cb"
            castsShadow={true}
            intensity={3000}
            shadowOrthographicPosition={asNum3(sunPos)}
            shadowOrthographicSize={30}
            shadowMapSize={2048}
            shadowNearZ={1}
            shadowFarZ={10}
          />

          <ViroAmbientLight color={"#DDEEFF"} intensity={500} />
        </ViroNode>
      </ViroNode>
    </ViroARScene>
  );
}

type PoiViewProps = {
  poi: PointOfInterest;
  user: Vector3;
  index: number;
};

const distanceToStart = 11;
const offsetFromPath = 1.5;
const distanceBetween = 2.5;
const showInfoDistance = 3;
const turns = 0;

export function PoiView({ poi, user, index }: PoiViewProps) {
  const poiCoord = new Vector3(offsetFromPath, 0, -(distanceToStart + index * distanceBetween));
  const distanceToUser = user.distanceTo(poiCoord);

  const model = poi.modelPath && (
    <Viro3DObject source={poi.modelPath} position={asNum3(poiCoord)} type={"GLB"} rotation={[0, turns * 360, 0]} />
  );

  return (
    <>
      {model}

      {distanceToUser < showInfoDistance && poi.info && (
        <ViroNode position={asNum3(poiCoord)} transformBehaviors={["billboardY"]}>
          <ViroNode scale={[0.13, 0.13, 0.13]} position={poi.info.position} transformBehaviors={["billboardY"]}>
            <ViroBox position={[0, 1.7, -1]} scale={[3.0, 3.0, 0.01]} materials={["textBackground"]} />
            <ViroText position={[0, 2, 0]} text={poi.info.name} style={{ fontSize: 30 }} width={2} color={textColor} />
            <ViroText
              position={[0, 1.6, 0]}
              text={poi.info.description}
              style={{ fontSize: 20 }}
              width={2}
              color={textColor}
            />
          </ViroNode>
        </ViroNode>
      )}

      <ViroQuad
        position={asNum3(poiCoord)}
        rotation={[-90, 0, 0]}
        width={8}
        height={8}
        arShadowReceiver={true}
      ></ViroQuad>
    </>
  );
}

function findBiggestPlane(anchors: Anchors) {
  const planes: ViroAnchor[] = Object.values(anchors).filter(
    (anchor) => anchor.type === "plane" && anchor.alignment !== "Vertical",
  );

  // Use a negated area so findMinimumBy returns the plane with the largest area.
  return findMinimumBy(planes, (plane) => -((plane.width ?? 0) * (plane.height ?? 0)));
}
