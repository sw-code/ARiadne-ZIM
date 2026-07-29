import { Vector3 } from "@math.gl/core";
import {
  GazeEncounter,
  GazeSignals,
  gazeSignalsAt,
  gazeTargetOfPanel,
  initialGazeEncounter,
  nextGazeEncounter,
  panelScaleAtDistance,
} from "@/src/3d/gazeEncounter";
import { degreesToRadians } from "@/src/shared/math";

// North space has y up and the camera looks along -z at yaw 0, turning right (towards +x) for positive yaw.
function horizontalDirectionAtYawDegrees(yawDegrees: number): Vector3 {
  const yawRadians = degreesToRadians(yawDegrees);
  return new Vector3(Math.sin(yawRadians), 0, -Math.cos(yawRadians));
}

function placeAt(yawDegrees: number, distanceMetres: number): Vector3 {
  return horizontalDirectionAtYawDegrees(yawDegrees).scale(distanceMetres);
}

const lookingStraightAhead = horizontalDirectionAtYawDegrees(0);
const standingStill = new Vector3(0, 0, 0);
const walkingStraightAhead = horizontalDirectionAtYawDegrees(0).scale(1.4);

const aimedWhileLookingAside: GazeSignals = { isOnScreen: true, isAimedAt: true, isLookingAside: true };

function afterFrames(frameCount: number, signals: GazeSignals, deltaSeconds: number) {
  let state: GazeEncounter = initialGazeEncounter;
  for (let frame = 0; frame < frameCount; frame++) {
    state = nextGazeEncounter(state, signals, deltaSeconds);
  }
  return state;
}

describe("gazeSignalsAt", () => {
  test("a panel within 25° and 50 m is on screen; at 30° or 60 m it is not", () => {
    expect(gazeSignalsAt(placeAt(24, 49), lookingStraightAhead, standingStill).isOnScreen).toBe(true);
    expect(gazeSignalsAt(placeAt(-24, 49), lookingStraightAhead, standingStill).isOnScreen).toBe(true);
    expect(gazeSignalsAt(placeAt(30, 49), lookingStraightAhead, standingStill).isOnScreen).toBe(false);
    expect(gazeSignalsAt(placeAt(0, 60), lookingStraightAhead, standingStill).isOnScreen).toBe(false);
  });

  test("aiming within 10° counts, 15° does not", () => {
    expect(gazeSignalsAt(placeAt(9, 20), lookingStraightAhead, standingStill).isAimedAt).toBe(true);
    expect(gazeSignalsAt(placeAt(-9, 20), lookingStraightAhead, standingStill).isAimedAt).toBe(true);
    expect(gazeSignalsAt(placeAt(15, 20), lookingStraightAhead, standingStill).isAimedAt).toBe(false);
  });

  test("exactly 50 m is not near", () => {
    const atFiftyMetres = gazeSignalsAt(placeAt(0, 50), lookingStraightAhead, standingStill);

    expect(atFiftyMetres.isOnScreen).toBe(false);
    expect(atFiftyMetres.isAimedAt).toBe(false);
  });

  test("a place 60 m away is not aimed at, however exactly the camera points at it", () => {
    expect(gazeSignalsAt(placeAt(0, 60), lookingStraightAhead, standingStill).isAimedAt).toBe(false);
  });

  test("walking toward the place does not count as looking aside; turning the camera 40° away does", () => {
    const cameraTurnedAway = horizontalDirectionAtYawDegrees(40);

    expect(gazeSignalsAt(placeAt(0, 20), lookingStraightAhead, walkingStraightAhead).isLookingAside).toBe(false);
    expect(gazeSignalsAt(placeAt(40, 20), cameraTurnedAway, walkingStraightAhead).isLookingAside).toBe(true);
  });

  test("24° away from the walking direction is not looking aside, 26° is", () => {
    const at24Degrees = horizontalDirectionAtYawDegrees(24);
    const at26Degrees = horizontalDirectionAtYawDegrees(26);

    expect(gazeSignalsAt(placeAt(24, 20), at24Degrees, walkingStraightAhead).isLookingAside).toBe(false);
    expect(gazeSignalsAt(placeAt(26, 20), at26Degrees, walkingStraightAhead).isLookingAside).toBe(true);
  });

  test("tilting the camera while looking along the walking direction does not count as looking aside", () => {
    const cameraTiltedDown = new Vector3(0, -1, -1);
    const walkingUphill = new Vector3(0, 0.3, -1.4);

    expect(gazeSignalsAt(placeAt(0, 20), cameraTiltedDown, walkingUphill).isLookingAside).toBe(false);
  });

  test("standing still counts as looking aside in any direction", () => {
    for (const cameraYawDegrees of [0, 90, 180, -90]) {
      const camera = horizontalDirectionAtYawDegrees(cameraYawDegrees);
      expect(gazeSignalsAt(placeAt(cameraYawDegrees, 20), camera, standingStill).isLookingAside).toBe(true);
    }
  });

  test("a slow drift below 0.5 m/s counts as standing", () => {
    const drifting = horizontalDirectionAtYawDegrees(0).scale(0.4);

    expect(gazeSignalsAt(placeAt(0, 20), lookingStraightAhead, drifting).isLookingAside).toBe(true);
  });
});

describe("nextGazeEncounter", () => {
  test("two seconds aimed while looking aside engage; one and a half do not", () => {
    expect(afterFrames(3, aimedWhileLookingAside, 0.5).hasEngaged).toBe(false);
    expect(afterFrames(4, aimedWhileLookingAside, 0.5).hasEngaged).toBe(true);
  });

  test("two seconds of continuous aim engage; four separate 0.5 s glances do not", () => {
    const lookingElsewhere: GazeSignals = { isOnScreen: false, isAimedAt: false, isLookingAside: true };

    let glancedFourTimes: GazeEncounter = initialGazeEncounter;
    for (let glance = 0; glance < 4; glance++) {
      glancedFourTimes = nextGazeEncounter(glancedFourTimes, aimedWhileLookingAside, 0.5);
      glancedFourTimes = nextGazeEncounter(glancedFourTimes, lookingElsewhere, 0.5);
    }

    expect(afterFrames(20, aimedWhileLookingAside, 0.1).hasEngaged).toBe(true);
    expect(glancedFourTimes.hasEngaged).toBe(false);
  });

  test("a place 60 m ahead, standing for one minute, is neither shown nor engaged", () => {
    const sixtyMetresAhead = gazeSignalsAt(placeAt(0, 60), lookingStraightAhead, standingStill);

    const afterAMinute = afterFrames(600, sixtyMetresAhead, 0.1);

    expect(afterAMinute.hasBeenShown).toBe(false);
    expect(afterAMinute.hasEngaged).toBe(false);
  });

  test("aimed while walking straight at the place never engages", () => {
    const straightAheadWhileWalking = gazeSignalsAt(placeAt(0, 20), lookingStraightAhead, walkingStraightAhead);

    const afterAMinute = afterFrames(600, straightAheadWhileWalking, 0.1);

    expect(afterAMinute.hasBeenShown).toBe(true);
    expect(afterAMinute.hasEngaged).toBe(false);
  });

  test("two seconds aimed at a place while standing engage", () => {
    const aimedWhileStanding = gazeSignalsAt(placeAt(5, 20), lookingStraightAhead, standingStill);

    expect(afterFrames(20, aimedWhileStanding, 0.1).hasEngaged).toBe(true);
  });

  test("one long frame, e.g. after the app resumes, counts as half a second of gaze at most", () => {
    const afterLongFrame = nextGazeEncounter(initialGazeEncounter, aimedWhileLookingAside, 30);

    expect(afterLongFrame).toEqual({ hasBeenShown: true, gazeSeconds: 0.5, hasEngaged: false });
  });

  test("a place on screen is shown even without being aimed at; one off screen is not", () => {
    const onScreenOnly: GazeSignals = { isOnScreen: true, isAimedAt: false, isLookingAside: true };
    const offScreen: GazeSignals = { isOnScreen: false, isAimedAt: false, isLookingAside: true };

    expect(nextGazeEncounter(initialGazeEncounter, onScreenOnly, 0.1)).toEqual({
      hasBeenShown: true,
      gazeSeconds: 0,
      hasEngaged: false,
    });
    expect(nextGazeEncounter(initialGazeEncounter, offScreen, 0.1).hasBeenShown).toBe(false);
  });

  test("shown and engaged stay set after the place leaves the screen", () => {
    const engaged = afterFrames(4, aimedWhileLookingAside, 0.5);
    const offScreen: GazeSignals = { isOnScreen: false, isAimedAt: false, isLookingAside: true };

    expect(nextGazeEncounter(engaged, offScreen, 0.1)).toMatchObject({ hasBeenShown: true, hasEngaged: true });
  });
});

describe("gazeTargetOfPanel", () => {
  // The panel node stands on the ground and grows by a tenth per metre of distance; the box drawn in it is centred
  // 1.7 m above the node's origin before that growth.
  test("the gaze target is the panel centre at every distance", () => {
    const groundY = -1.5;

    for (const { distanceMetres, panelCentreAboveGroundMetres } of [
      { distanceMetres: 5, panelCentreAboveGroundMetres: 1.7 * 1.5 },
      { distanceMetres: 40, panelCentreAboveGroundMetres: 1.7 * 5 },
    ]) {
      const placeOnGround = new Vector3(3, groundY, -distanceMetres);

      const target = gazeTargetOfPanel(placeOnGround, panelScaleAtDistance(distanceMetres));

      expect(target.x).toBe(3);
      expect(target.y).toBeCloseTo(groundY + panelCentreAboveGroundMetres);
      expect(target.z).toBe(-distanceMetres);
    }
  });
});
