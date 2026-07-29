import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { Vector3 } from "@math.gl/core";
import { PointOfInterest } from "@/src/shared/poi";
import { Viro3DObject, ViroBox, ViroMaterials, ViroNode, ViroQuad, ViroText } from "@reactvision/react-viro";
import { useEffect, useMemo, useRef } from "react";
import { asNum3, withY } from "@/src/3d/math3d";
import { degreesToRadians } from "@/src/shared/math";
import { AbsoluteTime, useTimeEffect } from "@/src/shared/ReactExtensions";
import { useUserProfile } from "@/src/shared/UserProfileProvider";

type PoiViewProps = {
  poi: PointOfInterest;
  northUser: Vector3;
  cameraForward: Vector3; // in north space, so it matches the POI's coordinate space
  time: AbsoluteTime;
  geoToLocal: (c: GeoCoordinate) => Vector3;
  groundY: number;
};

// A POI counts as "gazed at" while it is within this cone of the camera forward and this close.
// The accumulated dwell time is flushed into the profile on the given interval so we do not write
// to the profile context on every frame.
const gazeConeHalfAngleDegrees = 40;
const gazeMaxDistanceMetres = 10;
const gazeTargetHeightMetres = 1.6; // aim at the label, roughly eye level, so the cone stays horizontal
const dwellFlushIntervalSeconds = 1;
const gazeAlignmentThreshold = Math.cos(degreesToRadians(gazeConeHalfAngleDegrees));

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

export function PoiView({ poi, geoToLocal, northUser, cameraForward, time, groundY }: PoiViewProps) {
  const poiCoord = useMemo(
    () => withY(geoToLocal(poi.location.coordinate), groundY),
    [geoToLocal, poi.location.coordinate, groundY],
  );

  const profile = useUserProfile();

  // Self-learning: grow this subtype's priority for as long as the user looks at it. Accumulated
  // in refs and flushed on an interval to avoid a profile write every frame.
  const dwellSeconds = useRef(0);
  const secondsSinceFlush = useRef(0);

  useEffect(() => {
    return () => {
      if (dwellSeconds.current > 0) profile.addDwellSeconds(poi.subtype, dwellSeconds.current);
    };
  }, [profile, poi.subtype]);

  useTimeEffect(time, (deltaTime) => {
    const toTarget = withY(poiCoord, groundY + gazeTargetHeightMetres).subtract(northUser);
    const distance = toTarget.len();
    const alignment = distance > 0.001 ? cameraForward.dot(toTarget) / distance : -1;
    const isGazedAt = distance <= gazeMaxDistanceMetres && alignment > gazeAlignmentThreshold;

    if (isGazedAt) dwellSeconds.current += deltaTime.seconds;

    secondsSinceFlush.current += deltaTime.seconds;
    if (secondsSinceFlush.current >= dwellFlushIntervalSeconds) {
      secondsSinceFlush.current = 0;
      if (dwellSeconds.current > 0) {
        profile.addDwellSeconds(poi.subtype, dwellSeconds.current);
        dwellSeconds.current = 0;
      }
    }
  });

  const distance = northUser.distanceTo(poiCoord);
  const scale = 1 + distance * 0.1;

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
        <ViroNode position={asNum3(poiCoord)} scale={[scale, scale, scale]} transformBehaviors={["billboardY"]}>
          <ViroBox position={[0, 1.7, -0.1]} scale={[2.4, 1.5, 0.01]} materials={["textBackground"]} />
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
