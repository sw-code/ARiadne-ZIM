import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { Vector3 } from "@math.gl/core";
import { PointOfInterest } from "@/src/shared/poi";
import { Viro3DObject, ViroBox, ViroMaterials, ViroNode, ViroQuad, ViroText } from "@reactvision/react-viro";
import { useMemo, useRef } from "react";
import { asNum3, withY } from "@/src/3d/math3d";
import { AbsoluteTime, useTimeEffect } from "@/src/shared/ReactExtensions";
import {
  gazeSignalsAt,
  gazeTargetOfPanel,
  initialGazeEncounter,
  nextGazeEncounter,
  panelCentreHeightMetres,
  panelScaleAtDistance,
} from "@/src/3d/gazeEncounter";
import { WalkEncounters } from "@/src/3d/walkEncounters";

type PoiViewProps = {
  poi: PointOfInterest;
  northUser: Vector3;
  cameraForward: Vector3; // in north space, so it matches the POI's coordinate space
  userVelocity: Vector3; // in north space, like cameraForward
  time: AbsoluteTime;
  geoToLocal: (c: GeoCoordinate) => Vector3;
  groundY: number;
  encounters: WalkEncounters;
  onSelected: (poi: PointOfInterest) => void;
};

const textColor = "#444";

// The panel is a fixed 1.5 m tall and Viro draws one font point as 0.01 m. The 30 pt name takes about 0.4 m, which
// leaves room for four 20 pt lines (about 0.25 m each). Longer text is cut off instead of spilling over the name
// or out of the panel.
const maxDescriptionLines = 4;
ViroMaterials.createMaterials({
  textBackground: {
    lightingModel: "Constant",
    diffuseColor: "#FFF",
  },
});

export function PoiView({
  poi,
  geoToLocal,
  northUser,
  cameraForward,
  userVelocity,
  time,
  groundY,
  encounters,
  onSelected,
}: PoiViewProps) {
  const poiCoord = useMemo(
    () => withY(geoToLocal(poi.location.coordinate), groundY),
    [geoToLocal, poi.location.coordinate, groundY],
  );

  // A ref, not state: nothing is drawn from it, so re-rendering on every gaze update would be wasted work.
  const gazeEncounter = useRef(initialGazeEncounter);

  const distance = northUser.distanceTo(poiCoord);
  const scale = panelScaleAtDistance(distance);

  useTimeEffect(time, (deltaTime) => {
    const toPlace = gazeTargetOfPanel(poiCoord, scale).subtract(northUser);

    const previous = gazeEncounter.current;
    const signals = gazeSignalsAt(toPlace, cameraForward, userVelocity);
    const next = nextGazeEncounter(previous, signals, deltaTime.seconds);
    gazeEncounter.current = next;

    if (next.hasBeenShown && !previous.hasBeenShown) encounters.shown(poi);
    if (next.hasEngaged && !previous.hasEngaged) encounters.engaged(poi);
  });

  // Tapping the panel is a clear sign of interest, however briefly the place was looked at.
  const handlePanelClick = () => {
    encounters.engaged(poi);
    onSelected(poi);
  };

  if (distance > 1000) return null;

  const model = poi.modelPath && (
    <Viro3DObject
      source={poi.modelPath}
      position={asNum3(poiCoord)}
      type={"GLB"}
      rotation={[0, poi.location.headingDegrees, 0]}
    />
  );

  return (
    <>
      {model}

      {poi.info && (
        <ViroNode
          position={asNum3(poiCoord)}
          scale={[scale, scale, scale]}
          transformBehaviors={["billboardY"]}
          onClick={handlePanelClick}
        >
          <ViroBox
            position={[0, panelCentreHeightMetres, -0.1]}
            scale={[2.4, 1.5, 0.01]}
            materials={["textBackground"]}
          />
          <ViroText position={[0, 2, 0]} text={poi.info.name} style={{ fontSize: 30 }} width={2} color={textColor} />
          <ViroText
            position={[0, 1.6, 0]}
            text={poi.info.description}
            style={{ fontSize: 20 }}
            width={2}
            maxLines={maxDescriptionLines}
            color={textColor}
          />
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
