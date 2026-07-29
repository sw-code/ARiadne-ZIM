import { ViroMaterials, ViroNode, ViroPolyline, ViroQuad } from "@reactvision/react-viro";
import { AnimationsNameInDogFile, Dog } from "./models";
import { Vector3 } from "@math.gl/core";
import {
  arrayToVector3,
  asNum3,
  asNum3Array,
  bezier4Curve,
  curveToPolygon,
  distributePow,
  lerpVector3,
  quaternionToViroRotation,
  Transform,
  unitVectors,
  withY,
} from "@/src/3d/math3d";
import { Gait, NavigationGuideState } from "@/src/3d/components/NavigationGuide";

ViroMaterials.createMaterials({
  leather: {
    lightingModel: "Constant",
    diffuseColor: "#352516",
    cullMode: "None",
    writesToDepthBuffer: true,
  },
});

const animationForGait: Record<Gait, AnimationsNameInDogFile> = {
  standing: "Breathing",
  walking: "Walking01",
  running: "Running",
};

export function DogNavigator(props: { guide: NavigationGuideState; camera: Transform }): React.ReactElement {
  const { guide, camera } = props;

  const camPos = arrayToVector3(camera.viroTransform.position);
  const camVectors = unitVectors(camera);
  const camUp = camVectors.up();
  const camRight = camVectors.right();
  const camForward = camVectors.forward();

  const leashStartPoint = camPos.clone().addScaledVector(camUp, -0.1).addScaledVector(camRight, 0.05);
  const leashTargetPoint = guide.position.clone().add(new Vector3(0, 0.15, -0.2).transformByQuaternion(guide.rotation));

  const leashStartMidPoint = camPos.clone().addScaledVector(camForward, 0.8);
  const leashEndMidPoint = lerpVector3(leashTargetPoint, withY(camPos, leashTargetPoint.y), 0.5);

  const bezier = bezier4Curve([leashStartPoint, leashStartMidPoint, leashEndMidPoint, leashTargetPoint]);
  const leashPoints = curveToPolygon(5, distributePow(3), bezier);

  const leash = (
    <ViroPolyline
      thickness={0.02}
      points={asNum3Array(leashPoints)}
      materials={["leather"]}
      shadowCastingBitMask={1}
      lightReceivingBitMask={1}
    />
  );

  const animationName = animationForGait[guide.gait];

  const interruptible = guide.gait === "standing";

  return (
    <>
      <ViroNode position={asNum3(guide.position)} rotation={quaternionToViroRotation(guide.rotation)}>
        <Dog rotation={[90, 180, 0]} animation={{ name: animationName, interruptible }} />
      </ViroNode>

      <ViroQuad position={asNum3(guide.position)} rotation={[-90, 0, 0]} arShadowReceiver={true}></ViroQuad>

      {leash}

      {/*<ViroSphere position={asNum3(currentDogPos.clone().addScaledVector(dogLookDir, 5.3))} radius={0.01} />*/}
      {/*<ViroSphere position={asNum3(dogTargetWorldPos ?? Vector3.ZERO)} radius={0.05} />*/}
      {/*<ViroPolyline*/}
      {/*  points={[*/}
      {/*    asNum3(currentDogPos),*/}
      {/*    asNum3(currentDogPos.clone().add(dogVelocity?.clone().scale(20) ?? Vector3.ZERO)),*/}
      {/*  ]}*/}
      {/*/>*/}
    </>
  );
}
