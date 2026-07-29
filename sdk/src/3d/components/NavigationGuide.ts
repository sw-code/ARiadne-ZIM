import { Quaternion, Vector3 } from "@math.gl/core";
import {
  arrayToVector3,
  eraseY,
  lookQuaternion,
  smoothQuaternion,
  smoothVector3,
  Transform,
  unitVectors,
  withMaxLength,
  withY,
} from "@/src/3d/math3d";
import { AbsoluteTime, useTimeEffect } from "@/src/shared/ReactExtensions";
import { useState } from "react";
import { log } from "@/src/shared/Logger";
import { groundHeadingAlignment } from "@/src/3d/navigation";
import { clamp, radiansToDegrees } from "@/src/shared/math";

const guideToViewerMeters = 3;
// The guide walks along with the viewer and closes the remaining gap to its place at this rate.
const catchUpPerSecond = 1;
// Fast enough to catch up with a briskly walking viewer, e.g. after a turn.
const maxGuideMetersPerSecond = 2.5;
// Below this, the guide stands and looks at the viewer instead of where it walks.
const standingMetersPerSecond = 0.05;
// People walk at up to about 1.8 m/s, so a guide running at walking pace looks wrong.
const runningAboveMetersPerSecond = 1.8;
const fallbackMetersInFront = 1;
// A guide farther away would take too long to walk back, e.g. after relocalization moved the AR world.
const maxGuideToViewerMeters = 10;
// Below this, camera movement comes from swaying and hand movement rather than walking.
const minWalkingMetersPerSecond = 0.5;
// From this speed on, the guide takes over the viewer's full pace, so it does not jerk into motion at the minimum.
const fullWalkingMetersPerSecond = 0.8;

export type Gait = "standing" | "walking" | "running";

export type NavigationGuideState = {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
  rotation: Quaternion;
  gait: Gait;
};

export function useNavigationGuide(props: {
  y: number;
  nextTargetWorld: Vector3 | null;
  camera: Transform;
  viewerVelocity: Vector3;
  time: AbsoluteTime;
}): NavigationGuideState {
  const { y, nextTargetWorld, camera, viewerVelocity, time } = props;

  // Starts in front of the viewer instead of at the AR origin,
  // because the guide is remounted after every tracking loss, when the viewer may be far from the origin.
  const [guideState, setGuideState] = useState(() => guideStateInFrontOf(camera, y));

  const camForward = unitVectors(camera).forward();

  useTimeEffect(time, (deltaTime) => {
    const viewerToGuide = arrayToVector3(camera.viroTransform.position).subtract(guideState.position);
    const currentGuideToViewerMeters = eraseY(viewerToGuide).len();

    if (currentGuideToViewerMeters > maxGuideToViewerMeters) {
      log.info("NAVIGATION GUIDE | Too far from the viewer, placed in front", {
        guideToViewerMeters: Number(currentGuideToViewerMeters.toFixed(1)),
      });
      setGuideState(guideStateInFrontOf(camera, y));
      return;
    }

    setGuideState((guideState) => {
      const camPosOnGround = withY(arrayToVector3(camera.viroTransform.position), guideState.position.y);

      const targetOnGroundOrNull = nextTargetWorld && withY(nextTargetWorld, guideState.position.y);
      const inFrontOfCam = camPosOnGround.clone().addScaledVector(eraseY(camForward), fallbackMetersInFront);
      const targetOnGround = targetOnGroundOrNull ?? inFrontOfCam;

      const viewerToTarget = eraseY(targetOnGround.clone().subtract(camPosOnGround));
      const fallbackDirection = eraseY(camForward);
      const targetDirection = viewerToTarget.lengthSquared() < 0.0001 ? fallbackDirection : viewerToTarget;
      const guideDirection = targetDirection.lengthSquared() < 0.0001 ? new Vector3(0, 0, -1) : targetDirection;
      const guideTargetWorldPos = camPosOnGround
        .clone()
        .add(guideDirection.clone().normalize().scale(guideToViewerMeters));

      const guideToTarget = eraseY(guideTargetWorldPos.clone().subtract(guideState.position));
      if (guideToTarget.len() < 0.5) guideToTarget.set(0, 0, 0);

      const desiredVelocity = withMaxLength(
        walkingVelocity(viewerVelocity).addScaledVector(guideToTarget, catchUpPerSecond),
        maxGuideMetersPerSecond,
      );
      const desiredAcceleration = desiredVelocity.clone().subtract(guideState.velocity);

      const acceleration = smoothVector3(guideState.acceleration, desiredAcceleration, 40, deltaTime.seconds);

      const unboundedVelocity = guideState.velocity.clone().addScaledVector(acceleration, deltaTime.seconds);
      const velocity = withMaxLength(unboundedVelocity, maxGuideMetersPerSecond);

      const newPos = guideState.position.clone().addScaledVector(velocity ?? Vector3.ZERO, deltaTime.seconds);
      const position = withY(newPos, y);

      const isMoving = guideState.velocity.len() > standingMetersPerSecond;
      const lookToViewer = camPosOnGround.clone().subtract(position);
      const guideLookDir = eraseY(isMoving ? velocity : lookToViewer);
      const guideTargetRotation = lookQuaternion(guideLookDir);
      const rotation = smoothQuaternion(guideState.rotation, guideTargetRotation, 8, deltaTime.seconds);

      return { position, velocity, rotation, acceleration };
    });
  });

  return {
    ...guideState,
    gait: gaitAt(guideState.velocity.len()),
  };
}

function walkingVelocity(viewerVelocity: Vector3): Vector3 {
  const groundVelocity = eraseY(viewerVelocity);
  const walkingFraction = clamp(
    (groundVelocity.len() - minWalkingMetersPerSecond) / (fullWalkingMetersPerSecond - minWalkingMetersPerSecond),
    0,
    1,
  );
  return groundVelocity.scale(walkingFraction);
}

function gaitAt(metersPerSecond: number): Gait {
  if (metersPerSecond > runningAboveMetersPerSecond) return "running";
  if (metersPerSecond > standingMetersPerSecond) return "walking";
  return "standing";
}

type MovingPoint = { position: Vector3; velocity: Vector3 };

export type GuidePace = {
  viewerMetersPerSecond: number;
  guideMetersPerSecond: number;
  guideToViewerMeters: number;
  // Along the viewer's walking direction, negative once the viewer has overtaken the guide. Null while standing.
  guideAheadMeters: number | null;
  // Between where the guide leads and where the viewer actually walks. Null while standing.
  guideToWalkingDegrees: number | null;
};

/// Measures how well the guide keeps up with the viewer, for the logs of test walks.
export function measureGuidePace(viewer: MovingPoint, guide: MovingPoint, guideDirection: Vector3 | null): GuidePace {
  const viewerToGuide = eraseY(guide.position.clone().subtract(viewer.position));
  const walking = eraseY(viewer.velocity);
  const viewerMetersPerSecond = walking.len();
  const isWalking = viewerMetersPerSecond >= minWalkingMetersPerSecond;
  const alignment = isWalking && guideDirection ? groundHeadingAlignment(walking, guideDirection) : null;

  return {
    viewerMetersPerSecond,
    guideMetersPerSecond: eraseY(guide.velocity).len(),
    guideToViewerMeters: viewerToGuide.len(),
    guideAheadMeters: isWalking ? viewerToGuide.dot(walking.clone().normalize()) : null,
    guideToWalkingDegrees: alignment === null ? null : radiansToDegrees(Math.acos(clamp(alignment, -1, 1))),
  };
}

function guideStateInFrontOf(camera: Transform, y: number) {
  const viewerOnGround = withY(arrayToVector3(camera.viroTransform.position), y);
  const camForwardOnGround = eraseY(unitVectors(camera).forward());
  const inFrontDirection = camForwardOnGround.lengthSquared() < 0.0001 ? new Vector3(0, 0, -1) : camForwardOnGround;

  return {
    position: viewerOnGround.add(inFrontDirection.normalize().scale(guideToViewerMeters)),
    velocity: new Vector3(0, 0, 0),
    acceleration: new Vector3(0, 0, 0),
    rotation: new Quaternion().identity(),
  };
}
