import { Vector3 } from "@math.gl/core";
import { angleBetweenDegrees, eraseY, withY } from "@/src/3d/math3d";

// Keeping a place in the centre of the view this long without a break shows more interest than merely passing it.
// Glances are not summed: on the device, standing still and panning around engaged every place that came on screen.
const engagementGazeSeconds = 2;

// Frames normally take a few hundredths of a second. A frame after the app resumed or the phone stalled can take
// seconds without anyone having looked, and would engage the place in front of the camera at once.
const maxCountedFrameSeconds = 0.5;

// Places rarely stand within 10 m of the path, so a short range would almost never see one.
const maxEngagementDistanceMetres = 50;

// Being on screen only shows that the place was in view. Aiming shows that the user pointed the phone at it, so
// its cone is much narrower.
const onScreenHalfAngleDegrees = 25;
const aimedAtHalfAngleDegrees = 10;

// Below this the user stands, so their velocity says nothing about where they are heading.
const standingSpeedMetresPerSecond = 0.5;

// Looking at what lies ahead on the route is not a decision to look at it. Only a camera turned away from the
// walking direction by more than this shows that the user chose to look.
const lookingAsideAngleDegrees = 25;

// The panel's box centre above the place, in the panel node before its distance scale.
export const panelCentreHeightMetres = 1.7;

// The panel grows with distance so that its text stays readable from afar.
export function panelScaleAtDistance(distanceMetres: number): number {
  return 1 + distanceMetres * 0.1;
}

// Growing the panel lifts its centre, so a fixed height would aim below the panel at every distance.
export function gazeTargetOfPanel(placeOnGround: Vector3, panelScale: number): Vector3 {
  return withY(placeOnGround, placeOnGround.y + panelCentreHeightMetres * panelScale);
}

export type GazeSignals = { isOnScreen: boolean; isAimedAt: boolean; isLookingAside: boolean };

// All vectors are in north space, the space the places live in.
export function gazeSignalsAt(toPlace: Vector3, cameraForward: Vector3, userVelocity: Vector3): GazeSignals {
  const isNear = toPlace.len() < maxEngagementDistanceMetres;
  const angleToPlaceDegrees = angleBetweenDegrees(cameraForward, toPlace);
  return {
    isOnScreen: isNear && angleToPlaceDegrees <= onScreenHalfAngleDegrees,
    isAimedAt: isNear && angleToPlaceDegrees <= aimedAtHalfAngleDegrees,
    isLookingAside: isLookingAsideFromWalkingDirection(cameraForward, userVelocity),
  };
}

// Tilting the phone up or down must not look like turning away, so only the horizontal directions are compared.
function isLookingAsideFromWalkingDirection(cameraForward: Vector3, userVelocity: Vector3): boolean {
  const walkingDirection = eraseY(userVelocity);
  if (walkingDirection.len() < standingSpeedMetresPerSecond) return true;
  return angleBetweenDegrees(eraseY(cameraForward), walkingDirection) > lookingAsideAngleDegrees;
}

export type GazeEncounter = { hasBeenShown: boolean; gazeSeconds: number; hasEngaged: boolean };

export const initialGazeEncounter: GazeEncounter = { hasBeenShown: false, gazeSeconds: 0, hasEngaged: false };

// Shown and engaged never revert: the profile counts each place once per walk, so a place that leaves the
// screen again must not be counted a second time when it re-enters.
export function nextGazeEncounter(state: GazeEncounter, signals: GazeSignals, deltaSeconds: number): GazeEncounter {
  const frameSeconds = Math.min(deltaSeconds, maxCountedFrameSeconds);
  const isDeliberateLook = signals.isAimedAt && signals.isLookingAside;
  const gazeSeconds = isDeliberateLook ? state.gazeSeconds + frameSeconds : 0;
  return {
    hasBeenShown: state.hasBeenShown || signals.isOnScreen,
    gazeSeconds,
    hasEngaged: state.hasEngaged || gazeSeconds >= engagementGazeSeconds,
  };
}
