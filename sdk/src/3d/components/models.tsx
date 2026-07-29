/* eslint-disable @typescript-eslint/no-require-imports */
import { Viro3DObject } from "@reactvision/react-viro";
import { ViroObjectProps } from "@reactvision/react-viro/dist/components/AR/ViroCommonProps";
import { ViroScale } from "@reactvision/react-viro/dist/components/Types/ViroUtils";

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
export type AnimationsNameInDogFile = "Idle" | "Walk" | "Gallop";

export const Dog = (props: Omit<ViroObjectProps, "animation"> & DogProps) => (
  <Viro3DObject
    {...props}
    type="GLB"
    animation={{ name: props.animation.name, run: true, loop: true, interruptible: props.animation.interruptible }}
    source={require("@assets/3d/dog/shiba-inu.glb")}
    lightReceivingBitMask={1}
    shadowCastingBitMask={1}
  />
);
