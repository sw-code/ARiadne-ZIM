import { useState } from "react";
import { recordWithoutProperty } from "@/src/shared/JavascriptExtensions";
import { ViroAnchor, ViroARSceneNavigator } from "@reactvision/react-viro";

export type Anchors = Record<string, ViroAnchor>;

export function useAnchorsState() {
  const [anchors, setAnchors] = useState<Anchors>({});

  // functional updates, because ARCore reports many anchor changes before React renders again
  const setAnchor = (anchor: ViroAnchor) =>
    setAnchors((currentAnchors) => ({ ...currentAnchors, [anchor.anchorId]: { ...anchor } }));

  return {
    onAnchorFound: setAnchor,
    onAnchorUpdated: setAnchor,
    onAnchorRemoved: (anchor?: ViroAnchor) => {
      if (anchor) setAnchors((currentAnchors) => recordWithoutProperty(currentAnchors, anchor.anchorId));
    },
    anchors,
  };
}

// tack on some type definitions on viro props (they are not provided unfortunately)
export type ViroARSceneNavigatorComponent = InstanceType<typeof ViroARSceneNavigator>;

export type UntypedViroArNavigator = ViroARSceneNavigatorComponent["arSceneNavigator"];

export type ViroArNavigator<AppProps> = Omit<UntypedViroArNavigator, "viroAppProps"> & {
  viroAppProps: AppProps;
};

export type ViroArSceneProps<AppProps> = {
  arSceneNavigator: ViroArNavigator<AppProps>;
};
