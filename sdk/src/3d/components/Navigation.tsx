import {
  ViroAmbientLight,
  ViroAnchor,
  ViroDirectionalLight,
  ViroMaterials,
  ViroNode,
  ViroPolyline,
} from "@reactvision/react-viro";
import {
  arrayToVector3,
  asNum3,
  asNum3Array,
  down,
  eraseY,
  lookQuaternion,
  quaternionToViroRotation,
  smoothNumber,
  Transform,
  transformedPoint3D,
  transformedVector3D,
  unitVectors,
  withY,
} from "../math3d";
import {
  chooseNavigationAudioMode,
  groundHeadingAlignment,
  guideLeadDirection,
  IndexedPoints,
  IndexedSegments,
  navigationDirectionConeCosine,
  useNavigationState,
} from "../navigation";
import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { Arrow, SkyCompass } from "./models";
import { MagnetometerMeasurement } from "expo-sensors";
import { LocationObjectCoords } from "expo-location";
import {
  AbsoluteTime,
  useDeltaTime,
  useTimeThrottling,
  useTimeSmoothing,
  useTimeSmoothingNumber,
  useTimeInterval,
  useTimeIntervalEffect,
  useRenderRateLog,
  useTimeSmoothingVector,
} from "@/src/shared/ReactExtensions";
import { Path } from "@/src/shared/Directions";
import { useEffect, useMemo } from "react";
import { useNorthSpace } from "@/src/3d/northspace";
import { AppColors } from "@/src/shared/AppColors";
import { Stats } from "@/src/3d/components/overlay/Overlay";
import { SceneVision } from "@/src/3d/vision";
import { DangerMetrics, StreetInfo, summarizeDanger, useDetectDangerMetrics } from "@/src/3d/danger";
import { Anchors, UntypedViroArNavigator } from "@/src/shared/Viro";
import { Vector3 } from "@math.gl/core";
import { findMinimumBy } from "@/src/shared/JavascriptExtensions";
import { Street } from "@/App";
import { PointOfInterest } from "@/src/shared/poi";
import { PoiView } from "@/src/3d/components/PoiView";
import { DogNavigator } from "@/src/3d/components/DogNavigator";
import { measureGuidePace, useNavigationGuide } from "@/src/3d/components/NavigationGuide";
import { useNavigationAudio, NavigationAudioMode } from "@/src/3d/components/NavigationAudio";
import { log } from "@/src/shared/Logger";
import { useRateOfChangeVector3 } from "@/src/shared/math";
import { jsonWithRoundedNumbers } from "@/src/shared/JavascriptExtensions";

export type NavigationProps = {
  scene: SceneProps;
  device: DeviceProps;
  routing: RouteProps;
  geoInfo: { routeIntersections: GeoCoordinate[]; allStreets: Street[] };
  onStatsChanged: (stats: Stats) => void;
  onDangerStatusChanged: (status: DangerMetrics) => void;
  navigator: "dog" | "line";
};

export type SceneProps = {
  time: AbsoluteTime;
  sceneNavigator: UntypedViroArNavigator;
  anchors: Anchors;
  vision: SceneVision;
  pois: PointOfInterest[];
};

export type DeviceProps = {
  geoLocation: LocationObjectCoords;
  magneticMeasurement: MagnetometerMeasurement;
  camera: Transform;
};

export type RouteProps = {
  destinationCoordinate: GeoCoordinate;
  path: Path | null;
  error: string | null;
  setIsOffTrack: (should: boolean) => void;
};

const maxRenderedPois = 10;
const maxPoiDistanceMetres = 1000;
const guidePaceLogIntervalSeconds = 1;

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

export function Navigation({
  scene,
  device,
  routing,
  onStatsChanged,
  onDangerStatusChanged,
  geoInfo,
  navigator,
}: NavigationProps) {
  useRenderRateLog("Navigation");
  const userPosition = arrayToVector3(device.camera.viroTransform.position);
  // Per-frame position differences are dominated by tracking jitter and hand movement.
  const userVelocity = useTimeSmoothingVector(useRateOfChangeVector3(userPosition, scene.time), 2, scene.time);
  const north = useNorthSpace(scene, device, routing);
  const geoToLocal = north.geoToLocal;

  const deltaTime = useDeltaTime(scene.time);
  const smoothDt = useTimeSmoothing(deltaTime?.seconds || 1, 5, smoothNumber, scene.time);
  const framerate = useTimeThrottling(1 / smoothDt, 1, scene.time);

  useEffect(() => {
    onStatsChanged({ ...north.stats, framerate });
  }, [framerate, north.stats, onStatsChanged]);

  const intersections = geoInfo.routeIntersections;

  const northIntersections = useMemo(
    () => intersections.map((i) => ({ position: geoToLocal(i), radius: 5 })),
    [intersections, geoToLocal],
  );

  const indexedNorthIntersections =
    useMemo(() => northIntersections.length && new IndexedPoints(northIntersections), [northIntersections]) || null;

  const closestIntersection = useMemo(
    () => indexedNorthIntersections?.findClosestNearbyPoint(north.cameraPosition, 2),
    [indexedNorthIntersections, north.cameraPosition],
  );

  const distanceToClosestIntersection = (closestIntersection && closestIntersection.distanceToPoint) ?? null;

  const northPois = useMemo(
    () =>
      scene.pois.map((poi) => ({
        position: geoToLocal(poi.location.coordinate),
        radius: 0,
      })),
    [geoToLocal, scene.pois],
  );

  const indexedNorthPois = useMemo(() => {
    if (northPois.length === 0) return null;
    return new IndexedPoints(northPois);
  }, [northPois]);

  // Only the nearest POIs are shown for now. The interest profile still learns from dwell time
  // (see PoiView) so it can take over the selection again later.
  const visiblePois = useMemo(
    () =>
      indexedNorthPois
        ?.findClosestPoints(north.cameraPosition, maxRenderedPois, maxPoiDistanceMetres)
        .map((pointIndex) => scene.pois[pointIndex]!) ?? [],
    [indexedNorthPois, north.cameraPosition, scene.pois],
  );

  // Camera forward in north space, so each PoiView can decide whether it is being gazed at (and
  // grow its subtype's priority) using the same coordinate space its position lives in.
  const cameraForwardNorth = transformedVector3D(north.worldToNorthSpace, unitVectors(device.camera).forward());

  const northStreets = useMemo(() => {
    return geoInfo.allStreets.map((street) => ({
      start: withY(geoToLocal(street.start), -1),
      end: withY(geoToLocal(street.end), -1),
      width: street.width,
    }));
  }, [geoInfo.allStreets, geoToLocal]);

  const indexedNorthStreets =
    useMemo(() => northStreets.length !== 0 && new IndexedSegments(northStreets), [northStreets]) || null;

  const closestStreet = useMemo(
    () => indexedNorthStreets?.findClosestIntersectingSegment(north.cameraPosition, 1) ?? null,
    [indexedNorthStreets, north.cameraPosition],
  );

  const streetIntersectionDepth = closestStreet && closestStreet.intersectionDepth;

  const northNav = useNavigationState(north.cameraPosition, north.path, routing.path?.instructions, north.destination);

  const setIsOffTrack = routing.setIsOffTrack;
  useEffect(() => {
    setIsOffTrack(northNav.distanceToRoute > 30);
  }, [northNav.distanceToRoute, setIsOffTrack]);

  const streetInfo: StreetInfo = useMemo(
    () => ({
      nearestStreetIntersectionDepth: streetIntersectionDepth,
      distanceToClosestIntersection,
    }),
    [distanceToClosestIntersection, streetIntersectionDepth],
  );

  const danger = useDetectDangerMetrics(scene, device, streetInfo);
  useEffect(() => onDangerStatusChanged(danger), [danger, onDangerStatusChanged]);

  const biggestPlane = useMemo(() => {
    return findBiggestPlane(scene.anchors);
  }, [scene.anchors]);

  const planePos = biggestPlane && arrayToVector3(biggestPlane?.position);

  const groundY = planePos?.y;
  const defaultGroundY = -1;
  const currentGroundY = groundY ?? defaultGroundY;

  const segmentEndIndex = northNav.closestSegmentStartIndex + 1;
  const nextVertexOnRouteInNorthSpace = north?.path?.[segmentEndIndex];

  const currentSegmentStartInNorthSpace = north?.path?.[northNav.closestSegmentStartIndex];
  const currentSegmentDirectionWorld =
    currentSegmentStartInNorthSpace &&
    nextVertexOnRouteInNorthSpace &&
    transformedVector3D(
      north.northSpaceToWorld,
      nextVertexOnRouteInNorthSpace.clone().subtract(currentSegmentStartInNorthSpace),
    );

  const currentPointOnRouteInWorldSpace = transformedPoint3D(north.northSpaceToWorld, northNav.closestPointOnRoute);

  const directionToGo =
    currentSegmentDirectionWorld &&
    guideLeadDirection(
      currentSegmentDirectionWorld,
      currentPointOnRouteInWorldSpace.clone().subtract(userPosition),
      north.stats.geoAccuracyRadiusMeters,
    );

  const targetPositionInWorld = directionToGo && userPosition.clone().add(directionToGo.clone().normalize().scale(10));

  const navigationGuide = useNavigationGuide({
    y: currentGroundY,
    nextTargetWorld: targetPositionInWorld ?? null,
    camera: device.camera,
    viewerVelocity: userVelocity,
    time: scene.time,
  });

  useTimeIntervalEffect(guidePaceLogIntervalSeconds, scene.time, () => {
    const pace = measureGuidePace(
      { position: userPosition, velocity: userVelocity },
      navigationGuide,
      directionToGo ?? null,
    );
    const { geoTracking, geoAccuracyRadiusMeters, compassAccuracyDegrees } = north.stats;
    const sample = {
      navigator,
      ...pace,
      // horizontal, unlike northNav.distanceToRoute, which includes the phone's height above the route
      distanceToRouteMeters: eraseY(currentPointOnRouteInWorldSpace.clone().subtract(userPosition)).len(),
      geoTracking,
      geoAccuracyRadiusMeters,
      compassAccuracyDegrees,
    };
    // one line per sample, so test walk logs can be evaluated line by line
    log.info(`NAVIGATION GUIDE | Pace ${jsonWithRoundedNumbers(sample, 2)}`);
  });

  const objectsAttachedToCamera = <></>;

  const dog = (
    <>
      <DogNavigator guide={navigationGuide} camera={device.camera} />
    </>
  );

  const cameraForwardWorld = unitVectors(device.camera).forward();

  const guideAlignmentRaw = directionToGo ? groundHeadingAlignment(cameraForwardWorld, directionToGo) : null;
  // Smoothed so headings near the cone boundary don't flip the sound mode every frame.
  const smoothedGuideAlignment = useTimeSmoothingNumber(guideAlignmentRaw ?? 0, 5, scene.time);
  const guideAlignment = guideAlignmentRaw === null ? null : smoothedGuideAlignment;

  // Fallback direction: face along the route segment we are currently closest to. Lets a user who
  // looks away from the guide target but still down the route ahead avoid the "wrong direction" nag.
  const segmentAlignment = currentSegmentDirectionWorld
    ? groundHeadingAlignment(cameraForwardWorld, currentSegmentDirectionWorld)
    : null;

  const audioMode: NavigationAudioMode | null = chooseNavigationAudioMode({
    isDanger: summarizeDanger(danger).variant === "danger",
    guideAlignment,
    segmentAlignment,
  });

  // Logs whenever the chosen audio mode changes. If it fires every frame, the decision is
  // oscillating (which would also explain silence, since the sound would remount before playing).
  // Snapshot values (alignment/target/danger) are read at the moment the mode flips.
  useEffect(() => {
    log.info("NavigationAudio | mode decision", {
      audioMode,
      navigator,
      hasTarget: directionToGo != null,
      guideAlignment: guideAlignment != null ? Number(guideAlignment.toFixed(3)) : null,
      segmentAlignment: segmentAlignment != null ? Number(segmentAlignment.toFixed(3)) : null,
      facingGuide: guideAlignment != null && guideAlignment > navigationDirectionConeCosine,
      facingSegment: segmentAlignment != null && segmentAlignment > navigationDirectionConeCosine,
      dangerVariant: summarizeDanger(danger).variant,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMode]);

  useNavigationAudio(audioMode, navigator, scene.time);

  const polyLine = useTimeInterval(1, scene.time, () => {
    if (!north.path) return null;
    const pathToGo = north.path.slice(segmentEndIndex);
    const nextSteps = pathToGo.slice(0, 50);
    return [north.cameraPosition, northNav.closestPointOnRoute, ...nextSteps].map((vec) => withY(vec, currentGroundY));
  });

  const line = polyLine && <ViroPolyline points={asNum3Array(polyLine)} thickness={0.2} materials={["blue"]} />;

  const sunPos = arrayToVector3(device.camera.viroTransform.position).add(new Vector3(0, 5, 0));

  const worldDestination = transformedPoint3D(north.northSpaceToWorld, north.destination);
  const userToDestination = eraseY(worldDestination.clone().subtract(userPosition)).normalize();

  const arrowPos = userPosition
    .clone()
    .add(userToDestination.clone().scale(8))
    .add(new Vector3(0, 4, 0));

  const arrowRotation = lookQuaternion(down.clone().add(userToDestination.clone().scale(-0.3)), userToDestination);

  const destinationMarker = (
    <Arrow position={asNum3(arrowPos)} rotation={quaternionToViroRotation(arrowRotation)} scale={[6, 6, 6]} />
  );

  const worldObjects = (
    <>
      {navigator === "dog" && dog}

      <SkyCompass position={device.camera.viroTransform.position} rotation={north.transform.viroTransform.rotation} />

      {destinationMarker}

      <ViroDirectionalLight
        direction={[0, -1, 0]}
        color="#f7e6cb"
        castsShadow={true}
        intensity={3000}
        shadowOrthographicPosition={asNum3(sunPos)}
        shadowOrthographicSize={16}
        shadowMapSize={2048}
        shadowNearZ={1}
        shadowFarZ={10}
      />

      <ViroAmbientLight color={"#DDEEFF"} intensity={500} />
    </>
  );

  // const nearbyNorthStreets = useMemo(
  //   () => indexedNorthStreets?.findClosestSegments(north.cameraPosition, 32) ?? [],
  //   [indexedNorthStreets, north.cameraPosition],
  // );

  // const streetQuadElements = (
  //   <>
  //     {nearbyNorthStreets.map((street, index) => {
  //       const midpoint = street.start.clone().add(street.end).scale(0.5);
  //       const direction = street.end.clone().subtract(street.start);
  //       const segmentLength = direction.len();
  //
  //       if (segmentLength < 0.001) return null;
  //
  //       const yRotationDegrees = vector2Degrees(new Vector2(direction.z, direction.x));
  //
  //       return (
  //         <ViroQuad
  //           key={index}
  //           position={asNum3(midpoint)}
  //           rotation={[-90, yRotationDegrees, 0]}
  //           width={street.width}
  //           height={segmentLength}
  //           materials={["street"]}
  //         />
  //       );
  //     })}
  //   </>
  // );

  const worldNorthObjects = (
    <>
      {/*{streetQuadElements}*/}
      {navigator === "line" && line}
      {visiblePois.map((poi) => (
        <PoiView
          key={poi.id}
          groundY={currentGroundY}
          geoToLocal={north.geoToLocal}
          poi={poi}
          northUser={north.cameraPosition}
          cameraForward={cameraForwardNorth}
          time={scene.time}
        />
      ))}
    </>
  );

  return (
    <>
      {worldObjects}

      <ViroNode {...device.camera.viroTransform}>{objectsAttachedToCamera}</ViroNode>
      <ViroNode {...north.transform.viroTransform}>{worldNorthObjects}</ViroNode>
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
