import { ViroBox, ViroNode, ViroSphere } from "@reactvision/react-viro";
import { ViroObjectProps } from "@reactvision/react-viro/dist/components/AR/ViroCommonProps";

type Props = {
  width: number;
  height: number;
  borderRadius: number;
  node: ViroObjectProps;
};

export function RoundedRectangle(props: Props & ViroObjectProps) {
  const { width, height, borderRadius } = props;
  const object = props.node;
  const positive = (x: number) => Math.max(0.000001, x);
  if (!object.materials) throw "material is required";

  let sphereY = height / 2 - borderRadius;
  let sphereX = width / 2 - borderRadius;
  let sphereRad = positive(borderRadius);

  return (
    // this could use ViroGeometry in the future.
    <ViroNode {...object} scale={[1, 1, 0.001]}>
      <ViroBox scale={[positive(width), positive(height - borderRadius * 2), 1]} materials={object.materials} />

      <ViroBox scale={[positive(width - borderRadius * 2), positive(height), 1]} materials={object.materials} />

      <ViroSphere position={[sphereX, sphereY, 0]} radius={sphereRad} materials={object.materials} />

      <ViroSphere position={[-sphereX, -sphereY, 0]} radius={sphereRad} materials={object.materials} />

      <ViroSphere position={[-sphereX, sphereY, 0]} radius={sphereRad} materials={object.materials} />

      <ViroSphere position={[sphereX, -sphereY, 0]} radius={sphereRad} materials={object.materials} />
    </ViroNode>
  );
}
