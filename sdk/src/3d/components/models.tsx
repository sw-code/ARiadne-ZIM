/* eslint-disable @typescript-eslint/no-require-imports */
import { Viro3DObject, ViroMaterials } from "@reactvision/react-viro";
import { ViroObjectProps } from "@reactvision/react-viro/dist/components/AR/ViroCommonProps";
import { ViroScale } from "@reactvision/react-viro/dist/components/Types/ViroUtils";
import { File } from "expo-file-system";
import { useAssetsInDirectory } from "@/src/shared/AssetExtensions";

export const SkyCompass = (props: ViroObjectProps) => (
  <Viro3DObject {...props} type="GLB" source={require("@assets/3d/himmelsrichtungen.glb")} />
);

export const Arrow = (props: ViroObjectProps) => (
  <Viro3DObject {...props} type="GLB" source={require("@assets/3d/arrow.glb")} />
);

export type TargetAreaProps = { radius: number };
export const TargetArea = (props: ViroObjectProps & TargetAreaProps) => {
  const [sx, sy, sz] = props.scale || [1, 1, 1];
  const adjustedScale: ViroScale = [props.radius * sx, sy, props.radius * sz];

  return <Viro3DObject {...props} scale={adjustedScale} type="GLB" source={require("@assets/3d/target_area.glb")} />;
};

export type DogProps = { animation: { name: AnimationsNameInDogFile; interruptible: boolean } };
export type AnimationsNameInDogFile =
  | "NoAction"
  | "Breathing"
  | "WiglingTail"
  | "Eating"
  | "Sitting"
  | "Walking01"
  | "Walking02"
  | "Running"
  | "Angry.001";

ViroMaterials.createMaterials({
  dogPBR: {
    lightingModel: "PBR",
    diffuseTexture: require("@assets/3d/dog/RGB.png"),
    normalTexture: require("@assets/3d/dog/1_normal.png"),
    roughnessTexture: require("@assets/3d/dog/1_smoothness.png"),
    roughness: 0.5, // adjust for how rough/smooth the surface appears
    metalness: 0.1, // adjust how metallic it appears
    // optionally add ambientOcclusionTexture or metalnessTexture if available
  },
});

// Since 2.53, Viro cannot load the textures of a VRX that is bundled as Android resource (release builds):
// it copies them out of the APK, then tries to load the copies as bundled resources again.
// Loaded from a file instead, the model finds its textures next to itself.
const dogModelFiles = {
  "pug.vrx": require("@assets/3d/dog/pug.vrx"),
  "RGB.png": require("@assets/3d/dog/RGB.png"),
  "1_normal.png": require("@assets/3d/dog/1_normal.png"),
  "1_smoothness.png": require("@assets/3d/dog/1_smoothness.png"),
};

export const Dog = (props: Omit<ViroObjectProps, "animation"> & DogProps) => {
  const dogModelDirectory = useAssetsInDirectory("dog-model", dogModelFiles);
  if (!dogModelDirectory) return null;

  const animation = "pug_" + props.animation.name;

  return (
    <Viro3DObject
      {...props}
      type="VRX"
      animation={{ name: animation, run: true, loop: true, interruptible: props.animation.interruptible }}
      source={{ uri: new File(dogModelDirectory, "pug.vrx").uri }}
      materials={["dogPBR"]}
      lightReceivingBitMask={1}
      shadowCastingBitMask={1}
    />
  );
};
