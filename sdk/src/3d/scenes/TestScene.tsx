import { useState } from "react";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroMaterials,
  ViroNode,
  ViroSphere,
  ViroText,
} from "@reactvision/react-viro";
import {
  arrayToVector3,
  asNum3,
  viroLocalToParentMatrix,
  viroRotationToMatrix,
  viroRotationToQuaternion,
} from "../math3d";
import { Viro3DPoint, ViroRotation, ViroScale } from "@reactvision/react-viro/dist/components/Types/ViroUtils";
import { Pressable } from "react-native";
import { ViroArSceneProps } from "@/src/shared/Viro";

// This scene contains manual tests.
// To launch it, set the "test" flag to true.
// To cycle through the tests, tap on the screen.
export function TestScene() {
  const [testIndex, setCurrentTest] = useState(1);

  function next() {
    setCurrentTest(testIndex + 1);
  }

  const sceneProps: SceneProps = { testIndex };

  return (
    <Pressable onPress={next} style={{ flex: 1 }}>
      <ViroARSceneNavigator
        initialScene={{ scene: (props?: any) => <TestsScene {...props} /> }}
        style={{ flex: 1 }}
        viroAppProps={sceneProps}
      />
    </Pressable>
  );
}

type SceneProps = {
  testIndex: number;
};

function TestsScene(viroProps: ViroArSceneProps<SceneProps>) {
  const { testIndex } = viroProps.arSceneNavigator.viroAppProps;

  const tests = [viroEulerToQuatTest, viroEulerToMatrixTest, viroFullTransformToMatrixTest];
  const currentTest = tests[testIndex % tests.length]!();

  return (
    <ViroARScene>
      <ViroNode position={[0, 0, -0.5]} scale={[0.5, 0.5, 0.5]}>
        {currentTest}
      </ViroNode>
    </ViroARScene>
  );
}

function viroEulerToQuatTest() {
  const { normRand, randDeg } = seededRandoms();
  const eulerDegrees: ViroRotation = [randDeg(), randDeg(), randDeg()];
  const localOffset: Viro3DPoint = [normRand(), normRand(), normRand()];

  const rotateLocalToWorld = viroRotationToQuaternion(eulerDegrees);
  const reconstructedWorldPos = arrayToVector3(localOffset).transformByQuaternion(rotateLocalToWorld);

  return (
    <>
      <ViroNode rotation={eulerDegrees}>
        <ViroSphere position={localOffset} radius={0.2} scale={[1, 0.3, 1]} materials={["red"]} />
      </ViroNode>

      <ViroSphere
        position={asNum3(reconstructedWorldPos)}
        rotation={eulerDegrees}
        radius={0.2}
        scale={[0.3, 1, 0.3]}
        materials={["black"]}
      />
      <ViroText text="reconstructs quaternion" />
    </>
  );
}

function viroEulerToMatrixTest() {
  const { normRand, randDeg } = seededRandoms();
  const eulerDegrees: ViroRotation = [randDeg(), randDeg(), randDeg()];
  const offset: Viro3DPoint = [normRand(), normRand(), normRand()];

  const matrix = viroRotationToMatrix(eulerDegrees);
  const reconstructedWorldPos = arrayToVector3(offset).transformAsPoint(matrix);

  return (
    <>
      <ViroNode rotation={eulerDegrees}>
        <ViroSphere position={offset} radius={0.2} scale={[1, 0.3, 1]} materials={["red"]} />
      </ViroNode>

      <ViroSphere
        position={asNum3(reconstructedWorldPos)}
        rotation={eulerDegrees}
        radius={0.2}
        scale={[0.3, 1, 0.3]}
        materials={["black"]}
      />
      <ViroText text="reconstructs rotation matrix" />
    </>
  );
}

function viroFullTransformToMatrixTest() {
  const { unitRand, normRand, randDeg } = seededRandoms();
  const eulerDegrees: ViroRotation = [randDeg(), randDeg(), randDeg()];
  const position: Viro3DPoint = [normRand(), normRand(), normRand()];
  const scale: ViroScale = [unitRand(), unitRand(), unitRand()];

  const localTestPosition: Viro3DPoint = [normRand(), normRand(), normRand()];

  const localToParentMatrix = viroLocalToParentMatrix(position, eulerDegrees, scale);
  const reconstructedWorldPos = arrayToVector3(localTestPosition).transformAsPoint(localToParentMatrix);

  return (
    <>
      <ViroNode position={position} rotation={eulerDegrees} scale={scale}>
        <ViroSphere position={localTestPosition} radius={0.2} scale={[1, 0.3, 1]} materials={["red"]} />
      </ViroNode>

      <ViroSphere
        position={asNum3(reconstructedWorldPos)}
        rotation={eulerDegrees}
        radius={0.2}
        scale={[0.3, 1, 0.3]}
        materials={["black"]}
      />
      <ViroText text="reconstructs full transform" />
    </>
  );
}

function seededRandoms() {
  const randoms = [0.2, 0.5, 0.3, 0.9, 0.7, 0.1, 0.4, 1.0, 0.8, 0.3, 0.3, 0.2, 0.8, 0.5, 0.1];

  let nextRandomIndex = 0;
  const unitRand = (): number => randoms[nextRandomIndex++ % randoms.length]!;
  const normRand = () => unitRand() * 2 - 1;
  const randDeg = () => unitRand() * 360;
  return { unitRand, normRand, randDeg };
}

ViroMaterials.createMaterials({
  red: {
    lightingModel: "Constant",
    diffuseColor: "#F33",
  },
  black: {
    lightingModel: "Constant",
    diffuseColor: "#113",
  },
});
