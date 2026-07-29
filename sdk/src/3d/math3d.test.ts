import { Vector2, Vector3 } from "@math.gl/core";
import { wrap } from "../shared/math";
import {
  degreesToVector2,
  forward,
  lookQuaternion,
  quaternionToViroRotation,
  turnsToVector2,
  vector2Degrees,
  viroRotationToQuaternion,
  back,
  right,
  left,
  viroLocalToParentMatrix,
  chainTransforms,
} from "./math3d";
import { toBeDeepCloseTo, toMatchCloseTo } from "jest-matcher-deep-close-to";
import { ViroRotation } from "@reactvision/react-viro/dist/components/Types/ViroUtils";
expect.extend({ toBeDeepCloseTo, toMatchCloseTo });

const wrap360 = (x: number) => wrap(x, 360);

describe("math3d", () => {
  it("vec2 -> degrees", () => {
    expect(vector2Degrees(new Vector2(1, 0))).toBeCloseTo(0);
    expect(vector2Degrees(new Vector2(0, -1))).toBeCloseTo(360 - 90);
    expect(vector2Degrees(new Vector2(-1, 0))).toBeCloseTo(180);
    expect(vector2Degrees(new Vector2(0, 1))).toBeCloseTo(360 - 270);
    expect(vector2Degrees(new Vector2(0, 0), Number.NaN)).toBeNaN();
    expect(vector2Degrees(new Vector2(0, 0))).toBeCloseTo(0);
  });

  it("turns -> vec2", () => {
    expect(turnsToVector2(0)).toBeDeepCloseTo([1, 0]);
    expect(turnsToVector2(1 - 0.25)).toBeDeepCloseTo([0, -1]);
    expect(turnsToVector2(1 - 0.5)).toBeDeepCloseTo([-1, 0]);
    expect(turnsToVector2(1 - 0.75)).toBeDeepCloseTo([0, 1]);
  });

  it("vec/degree roundtrips", () => {
    for (const degrees of [-1, -0.5, 0, 0.25, 3, 10000]) {
      const vec = degreesToVector2(degrees);
      const degreesOfVec = vector2Degrees(vec);
      expect(wrap(degrees, 360)).toBeCloseTo(wrap(degreesOfVec, 360));
    }
  });

  it("euler->quaternion->euler roundtrips", () => {
    const testRotations: ViroRotation[] = [
      [+130, +24, +12],
      [-120, -24, -12],
      [0, 0, 0],
      [350, 350, 350],
      [84, 80, 76],
      [-80, -76, -84],
    ];

    for (const inputEuler of testRotations) {
      const quat = viroRotationToQuaternion(inputEuler);
      const reconstructedEuler = quaternionToViroRotation(quat);
      expect(inputEuler.map(wrap360)).toBeDeepCloseTo(reconstructedEuler.map(wrap360));
    }
  });

  it("looks at point with direction and up vector", () => {
    // Test looking forward (default up vector)
    const forwardQuat = lookQuaternion(forward);
    expect(forwardQuat).toBeDefined();
    expect(forwardQuat.x).toBeCloseTo(0);
    expect(forwardQuat.y).toBeCloseTo(0);
    expect(forwardQuat.z).toBeCloseTo(0);
    expect(forwardQuat.w).toBeCloseTo(1);

    // Test looking backward
    const backwardQuat = lookQuaternion(back);
    expect(backwardQuat).toBeDefined();
    // Should be a 180 degree rotation around Y axis
    expect(backwardQuat.x).toBeCloseTo(0);
    expect(backwardQuat.y).toBeCloseTo(1);
    expect(backwardQuat.z).toBeCloseTo(0);
    expect(backwardQuat.w).toBeCloseTo(0);

    // Test looking right - check actual values first
    const rightQuat = lookQuaternion(right);
    expect(rightQuat).toBeDefined();
    // Just verify it's a valid quaternion
    expect(Math.abs(rightQuat.w)).toBeCloseTo(0.7071, 3);
    expect(rightQuat.x).toBeCloseTo(0);
    expect(Math.abs(rightQuat.y)).toBeCloseTo(0.7071, 3);
    expect(rightQuat.z).toBeCloseTo(0);

    // Test looking left
    const leftQuat = lookQuaternion(left);
    expect(leftQuat).toBeDefined();
    // Just verify it's a valid quaternion
    expect(Math.abs(leftQuat.w)).toBeCloseTo(0.7071, 3);
    expect(leftQuat.x).toBeCloseTo(0);
    expect(Math.abs(leftQuat.y)).toBeCloseTo(0.7071, 3);
    expect(leftQuat.z).toBeCloseTo(0);

    // Test looking slightly up (not exactly parallel to up vector)
    const slightlyUp = new Vector3(0, 0.1, -1).normalize();
    const slightlyUpQuat = lookQuaternion(slightlyUp);
    expect(slightlyUpQuat).toBeDefined();
    // Verify it's a valid quaternion
    expect(slightlyUpQuat.w).not.toBeNaN();
    expect(slightlyUpQuat.x).not.toBeNaN();
    expect(slightlyUpQuat.y).not.toBeNaN();
    expect(slightlyUpQuat.z).not.toBeNaN();

    // Test looking slightly down (not exactly parallel to up vector)
    const slightlyDown = new Vector3(0, -0.1, -1).normalize();
    const slightlyDownQuat = lookQuaternion(slightlyDown);
    expect(slightlyDownQuat).toBeDefined();
    // Verify it's a valid quaternion
    expect(slightlyDownQuat.w).not.toBeNaN();
    expect(slightlyDownQuat.x).not.toBeNaN();
    expect(slightlyDownQuat.y).not.toBeNaN();
    expect(slightlyDownQuat.z).not.toBeNaN();
  });

  it("looks at with custom up vectors", () => {
    // Test with custom up vector pointing in X direction
    const customUpX = new Vector3(1, 0, 0);
    const forwardWithCustomUpX = lookQuaternion(forward, customUpX);
    expect(forwardWithCustomUpX).toBeDefined();

    // Test with custom up vector pointing in Z direction
    const customUpZ = new Vector3(0, 0, 1);
    const forwardWithCustomUpZ = lookQuaternion(forward, customUpZ);
    expect(forwardWithCustomUpZ).toBeDefined();

    // Test with diagonal up vector
    const diagonalUp = new Vector3(1, 1, 0).normalize();
    const forwardWithDiagonalUp = lookQuaternion(forward, diagonalUp);
    expect(forwardWithDiagonalUp).toBeDefined();
  });

  it("looks at with arbitrary directions", () => {
    // Test looking at a 45-degree angle forward-right
    const forwardRight = new Vector3(1, 0, -1).normalize();
    const forwardRightQuat = lookQuaternion(forwardRight);
    expect(forwardRightQuat).toBeDefined();

    // Test looking at a 45-degree angle forward-up
    const forwardUp = new Vector3(0, 1, -1).normalize();
    const forwardUpQuat = lookQuaternion(forwardUp);
    expect(forwardUpQuat).toBeDefined();

    // Test looking at a complex direction
    const complexDir = new Vector3(1, 2, -3).normalize();
    const complexQuat = lookQuaternion(complexDir);
    expect(complexQuat).toBeDefined();
  });

  it("lookQuaternion produces normalized quaternions", () => {
    const testDirections = [
      forward,
      back,
      right,
      left,
      new Vector3(1, 1, 1).normalize(),
      new Vector3(-1, 0.5, 2).normalize(),
      new Vector3(0, 0.1, -1).normalize(), // slightly up
      new Vector3(0, -0.1, -1).normalize(), // slightly down
    ];

    for (const dir of testDirections) {
      const quat = lookQuaternion(dir);
      // Check that quaternion is not NaN
      expect(quat.w).not.toBeNaN();
      expect(quat.x).not.toBeNaN();
      expect(quat.y).not.toBeNaN();
      expect(quat.z).not.toBeNaN();

      // Check that quaternion is normalized (magnitude should be 1)
      const magnitude = Math.sqrt(quat.x * quat.x + quat.y * quat.y + quat.z * quat.z + quat.w * quat.w);
      expect(magnitude).toBeCloseTo(1, 6);
    }
  });

  it("lookQuaternion handles edge cases", () => {
    // Test with very small direction vector
    const tinyDir = new Vector3(0.0001, 0, -1);
    const tinyQuat = lookQuaternion(tinyDir);
    expect(tinyQuat).toBeDefined();

    // Test with very large direction vector
    const largeDir = new Vector3(1000, 2000, -3000).normalize();
    const largeQuat = lookQuaternion(largeDir);
    expect(largeQuat).toBeDefined();
  });

  it("lookQuaternion roundtrip consistency", () => {
    // Test that applying the quaternion to the forward vector gives the expected direction
    const testDirections = [
      forward,
      back,
      right,
      left,
      new Vector3(1, 1, 1),
      new Vector3(-1, 0.5, 2),
      new Vector3(0, 0.1, -1), // slightly up
      new Vector3(0, -0.1, -1), // slightly down
    ];

    for (const dir of testDirections) {
      const quat = lookQuaternion(dir);

      // Apply quaternion to forward vector
      const rotatedForward = forward.clone().transformByQuaternion(quat);

      // The lookQuaternion function creates a rotation that transforms the coordinate system
      // so that the forward vector points in the target direction
      expect(rotatedForward.clone().normalize()).toBeDeepCloseTo(dir.clone().normalize());
    }
  });

  it("chains transforms", () => {
    const [a, b, c] = [
      viroLocalToParentMatrix([1, 2, 3], [20, 70, 120], [0.1, 3.0, 2.0]),
      viroLocalToParentMatrix([-1, 22, 0.3], [-60, 40, 220], [0.15, 13.0, 1.1]),
      viroLocalToParentMatrix([0.1, -2, 23], [10, 290, 100], [1.1, 3.6, 1.0]),
    ];

    const abc = chainTransforms(a, b, c);

    const randomPoints = [new Vector3(0, 0, 0), new Vector3(1, 1, 1), new Vector3(-1, -2, -3)];

    for (const point of randomPoints) {
      const reference = point.clone().transformAsPoint(a).transformAsPoint(b).transformAsPoint(c);

      const result = abc.transformAsPoint(point);
      expect(result).toBeDeepCloseTo(reference);
    }
  });
});
