import { Viro3DPoint, ViroRotation, ViroScale } from "@reactvision/react-viro/dist/components/Types/ViroUtils";
import {
  degreesToRadians,
  FULL_RADIAN,
  lerpDegrees,
  radiansToDegrees,
  radiansToTurns,
  turnsToRadians,
  wrap,
} from "../shared/math";
import { clamp, Euler, lerp, Matrix3, Matrix4, Quaternion, Vector2, Vector3 } from "@math.gl/core";
import { enumerate, findMinimumBy, randomIndex, sum } from "@/src/shared/JavascriptExtensions";

// we can't use Vector3, Vector2, from gl-math because they could also be Float32Arrays :(
export type Num3 = [number, number, number];
export type Num2 = [number, number];

export const up = Object.freeze(new Vector3(0, 1, 0));
export const forward = Object.freeze(new Vector3(0, 0, -1));
export const right = Object.freeze(new Vector3(1, 0, 0));
export const down = Object.freeze(up.clone().negate());
export const back = Object.freeze(forward.clone().negate());
export const left = Object.freeze(right.clone().negate());

export type ViroTransform = {
  position: Viro3DPoint;
  rotation: ViroRotation;
  scale?: ViroScale;
};

export type Transform = {
  viroTransform: ViroTransform;
  localToParent: Matrix4;
  parentToLocal: Matrix4;
};

export function identityTransform(): Transform {
  return {
    viroTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    },
    localToParent: Matrix4.IDENTITY.clone(),
    parentToLocal: Matrix4.IDENTITY.clone(),
  };
}

export function computeTransform(viroTransform: ViroTransform): Transform {
  const localToParent = viroLocalToParentMatrix(viroTransform.position, viroTransform.rotation, viroTransform.scale);
  const parentToLocal = localToParent.clone().invert();
  return Object.freeze({ viroTransform, localToParent, parentToLocal });
}

export function computeTransformFromMatrix(localToParent: Matrix4): Transform {
  const position = asNum3(new Vector3(localToParent.getTranslation()));

  const rotationMatrix = new Matrix4();
  localToParent.getRotation(rotationMatrix);

  const rotation = rotationMatrixToViroRotation(rotationMatrix);
  const scale = asNum3(new Vector3(localToParent.getScale()));

  const parentToLocal = localToParent.clone().invert();
  return Object.freeze({ viroTransform: { position, rotation, scale }, localToParent, parentToLocal });
}

export function withoutY(vec: Vector3): Vector2 {
  return new Vector2(vec.x, vec.z);
}

export function eraseY(vec: Vector3): Vector3 {
  const clone = vec.clone();
  clone.y = 0;
  return clone;
}

export function withY(vec: Vector3, y: number): Vector3 {
  const clone = vec.clone();
  clone.y = y;
  return clone;
}

/// Uses math angle.
export function vector2Radians(vec: Vector2, fallback: number = 0): number {
  if (vector2IsZero(vec)) return fallback;
  return wrap(vec.horizontalAngle(), FULL_RADIAN);
}

export function vector2Turns(vec: Vector2, fallback: number = 0): number {
  return radiansToTurns(vector2Radians(vec, fallback));
}

export function vector2Degrees(vec: Vector2, fallback: number = 0): number {
  return radiansToDegrees(vector2Radians(vec, fallback));
}

export function xzDegrees(vec: Vector3, fallback: number = 0): number {
  return vector2Degrees(new Vector2(vec.x, vec.z), fallback);
}

/// Uses math angle.
// Todo: feed back to @math.gl
export function radiansToVector2(r: number): Vector2 {
  return new Vector2(Math.cos(r), Math.sin(r));
}

export function degreesToVector2(d: number): Vector2 {
  return radiansToVector2(degreesToRadians(d));
}

export function degreesToXz(d: number): Vector3 {
  const vec2 = degreesToVector2(d);
  return new Vector3(vec2.x, 0, vec2.y);
}

export function turnsToVector2(t: number): Vector2 {
  return radiansToVector2(turnsToRadians(t));
}

export function vector3IsZero(v: Vector3): boolean {
  return v.x === 0 && v.y === 0 && v.z === 0;
}

export function vector2IsZero(v: Vector2): boolean {
  return v.x === 0 && v.y === 0;
}

export function asNum3(vec3: Vector3): Num3 {
  // only works because vector3 extends js array and we know it will always have 3 elements
  return vec3 as any as [number, number, number];
}

export function asNum3Array(vec3Array: Vector3[]): Num3[] {
  // only works because vector3 extends js array and we know it will always have 3 elements
  return vec3Array as any as [number, number, number][];
}

export function asNum2(vec2: Vector2): Num2 {
  // only works because vector2 extends js array and we know it will always have 3 elements
  return vec2 as any as [number, number];
}

export function transformedPoint3D(matrix: Matrix4, point: Vector3): Vector3 {
  const result = point.clone();
  matrix.transformAsPoint(result, result);
  return result;
}

export function transformedVector3D(matrix: Matrix4, vector: Vector3): Vector3 {
  const result = vector.clone();
  matrix.transformAsVector(result, result);
  return result;
}

export function lookQuaternion(lookDirection: Vector3, upVec: Vector3 = up): Quaternion {
  // this check saves allocations and computation
  if (lookDirection.lengthSquared() < 0.000001) return new Quaternion().identity();
  return new Quaternion().fromMatrix3(lookRotationMatrix(lookDirection, upVec)).normalize();
}

/// Results for lookDirection of zero are not defined.
export function lookRotationMatrix(lookDirection: Vector3, upVec: Vector3 = up): Matrix3 {
  if (lookDirection.lengthSquared() < 0.0001) return new Matrix3().identity();

  // Normalize the look direction
  const forward = lookDirection.clone().normalize();

  // Use Gram-Schmidt process to create an orthonormal basis
  // Start with the up vector and make it perpendicular to forward
  const up = upVec.clone().normalize();
  const right = new Vector3(forward).cross(up).normalize();

  // Recompute up to ensure it's perpendicular to both forward and right
  const newUp = new Vector3(right).cross(forward);

  // Create rotation matrix from the orthonormal basis
  // The matrix columns are [right, newUp, -forward] (negative forward because we want to look in that direction)
  const matrix = new Matrix3();
  matrix.setColumn(0, right);
  matrix.setColumn(1, newUp);
  matrix.setColumn(2, forward.clone().negate());

  return matrix;
}

export function viroLocalToParentMatrix(pos: Viro3DPoint, eulerDegrees: ViroRotation, scale?: ViroScale): Matrix4 {
  const posMatrix = Matrix4.IDENTITY.clone().translate(pos);
  const rotMatrix = viroRotationToMatrix(eulerDegrees);

  if (scale) {
    const scaleMatrix = Matrix4.IDENTITY.clone().scale(scale);
    return posMatrix.multiplyRight(rotMatrix.multiplyRight(scaleMatrix));
  } else {
    return posMatrix.multiplyRight(rotMatrix);
  }
}

// If you pass (scale, rot, pos) it will apply scale first, and then rot, and then pos.
export function chainTransforms(...firstToLast: Matrix4[]): Matrix4 {
  const result = Matrix4.IDENTITY.clone();

  // multiply from RIGHT TO LEFT (opposite of desired order).
  // this equals: pos * (rot * (scale * identity)).
  for (let i = firstToLast.length - 1; i >= 0; i--) result.multiplyRight(firstToLast[i]!);

  return result;
}

// Applies all transformations to the point.
// If you pass (scale, rot, pos) it will apply scale first, and then rot, and then pos.
export function transformPointChained(point: Vector3, firstToLast: Matrix4[]): Vector3 {
  const transformedPoint = point.clone();
  for (const mat of firstToLast) transformedPoint.transformAsPoint(mat);
  return transformedPoint;
}

export function viroRotationToMatrix(eulerDegrees: ViroRotation): Matrix4 {
  const quat = viroRotationToQuaternion(eulerDegrees);
  return new Matrix4().fromQuaternion(quat); // matrix directly from euler did not work. Open a bug in math.gl?
}

export function rotationMatrixToViroRotation(matrix: Matrix4): ViroRotation {
  const eulerRadians = new Euler(0, 0, 0, Euler.ZYX).fromRotationMatrix(matrix);
  const x = degreesToRadians(eulerRadians.x);
  const y = degreesToRadians(eulerRadians.y);
  const z = degreesToRadians(eulerRadians.z);
  return [z, y, x];
}

export function viroRotationToQuaternion(eulerDegrees: ViroRotation): Quaternion {
  return viroRotationToEuler(eulerDegrees).getQuaternion().normalize();
}

function viroRotationToEuler(eulerDegrees: ViroRotation): Euler {
  const x = degreesToRadians(eulerDegrees[0]);
  const y = degreesToRadians(eulerDegrees[1]);
  const z = degreesToRadians(eulerDegrees[2]);

  // IMPORTANT: arguments need to be passed in the same order as the order variable denotes.
  // we also negate components, as this euler expects +z forward, but viro is -z forward...
  // but for some reason, in practice, the rotation is correct like this, and does not need any negation!
  return new Euler(z, y, x, Euler.ZYX);
}

export function quaternionToViroRotation(q: Quaternion): ViroRotation {
  const euler = quaternionToEuler(q);

  // apparently these don't need to be swapped by the euler order?!?!?! wow.
  return [radiansToDegrees(euler.x), radiansToDegrees(euler.y), radiansToDegrees(euler.z)];
}

function quaternionToEuler(q: Quaternion): Euler {
  const euler = new Euler().fromQuaternion(q.clone().normalize());
  if (euler.order !== Euler.ZYX) throw "incompatible rotation order for viro!";
  return euler;
}

export function withMaxLength(vec: Vector3, max: number): Vector3 {
  const lenSqr = vec.lengthSquared();
  if (lenSqr > max * max) return vec.clone().multiplyByScalar(max / Math.sqrt(lenSqr));
  return vec;
}

export function clampVector3Length(vec: Vector3, min: number, max: number): Vector3 | null {
  const lenSqr = vec.lengthSquared();

  if (lenSqr < min * min) {
    if (lenSqr === 0) return null;
    return vec.clone().multiplyByScalar(min / Math.sqrt(lenSqr));
  }

  if (lenSqr > max * max) return vec.clone().multiplyByScalar(max / Math.sqrt(lenSqr));
  return vec;
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothNumber(current: number, target: number, speed: number, deltaSeconds: number): number {
  return lerp(current, target, exponentialSmoothingFactor(speed, deltaSeconds));
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothDegrees(current: number, target: number, speed: number, deltaSeconds: number): number {
  return lerpDegrees(current, target, exponentialSmoothingFactor(speed, deltaSeconds));
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothVector2(current: Vector2, target: Vector2, speed: number, deltaSeconds: number): Vector2 {
  return lerpVector2(current, target, exponentialSmoothingFactor(speed, deltaSeconds));
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothVector3(current: Vector3, target: Vector3, speed: number, deltaSeconds: number): Vector3 {
  return lerpVector3(current, target, exponentialSmoothingFactor(speed, deltaSeconds));
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothQuaternion(
  current: Quaternion,
  target: Quaternion,
  speed: number,
  deltaSeconds: number,
): Quaternion {
  return current.clone().slerp(target, exponentialSmoothingFactor(speed, deltaSeconds));
}

/// Proper exponential smoothing over time. Speed will usually be between 5 and 50.
export function smoothOptionalVector3(
  current: Vector3 | undefined,
  target: Vector3 | undefined,
  speed: number,
  deltaSeconds: number,
): Vector3 | undefined {
  if (!target) return current;
  if (!current) return undefined;
  return smoothVector3(current, target, speed, deltaSeconds);
}

export function arrayToVector3(array: number[]): Vector3 {
  if (array.length < 3) throw "Vector3 needs 3 elements, but only got " + array.length;
  return new Vector3(...array);
}

export function exponentialSmoothingFactor(speed: number, deltaSeconds: number): number {
  return 1 - Math.exp(-deltaSeconds * speed);
}

export function lerpVector3(from: Vector3, to: Vector3, factor: number): Vector3 {
  const delta = to.clone().subtract(from);
  return from.clone().addScaledVector(delta, factor);
}

export function lerpVector2(from: Vector2, to: Vector2, factor: number): Vector2 {
  const delta = to.clone().subtract(from);
  return from.clone().addScaledVector(delta, factor);
}

export type Curve3d = (fraction: number) => Vector3;
type Distribution = (fraction: number) => number;

export function bezier3Curve([a, b, c]: [Vector3, Vector3, Vector3]): Curve3d {
  return (fraction) => {
    const ab = lerpVector3(a, b, fraction);
    const bc = lerpVector3(b, c, fraction);
    return lerpVector3(ab, bc, fraction);
  };
}

export function bezier4Curve([a, b, c, d]: [Vector3, Vector3, Vector3, Vector3]): Curve3d {
  return (fraction) => {
    const ab = lerpVector3(a, b, fraction);
    const bc = lerpVector3(b, c, fraction);
    const cd = lerpVector3(c, d, fraction);
    const abc = lerpVector3(ab, bc, fraction);
    const bcd = lerpVector3(bc, cd, fraction);
    return lerpVector3(abc, bcd, fraction);
  };
}

export function distributePow(exponent: number): Distribution {
  return (fraction) => Math.pow(fraction, exponent);
}

export function curveToPolygon(resolution: number, distribution: Distribution, curve: Curve3d): Vector3[] {
  return enumerate(resolution)
    .map((index) => index / (resolution - 1))
    .map(distribution)
    .map(curve);
}

export function unitVectors(transform: Transform) {
  return {
    forward(): Vector3 {
      return transformedVector3D(transform.localToParent, forward);
    },
    right(): Vector3 {
      return transformedVector3D(transform.localToParent, right);
    },
    up(): Vector3 {
      return transformedVector3D(transform.localToParent, up);
    },
  };
}

export type Segment = [Vector3, Vector3];

/// Finds the closest point to the given point which is still on the segment.
export function projectPointToSegment(point: Vector3, segment: Segment): Vector3 {
  const [start, end] = segment;
  const segmentSqrLen = start.distanceToSquared(end);
  if (segmentSqrLen < 0.0001) return start; // segment is actually a point

  const at = point.clone().subtract(start).dot(end.clone().subtract(start)) / segmentSqrLen;
  return evaluateSegmentClamped(segment, at);
}

/// Evaluates position on the segment, clamped to start and end.
export function evaluateSegmentClamped([start, end]: Segment, at: number): Vector3 {
  const clampedFactor = clamp(at, 0, 1);
  return lerpVector3(start, end, clampedFactor);
}

export function angleBetweenSegmentsIsAcute(a: Segment, b: Segment): boolean {
  const [aStart, aEnd] = a;
  const aDir = aEnd.clone().subtract(aStart);

  const [bStart, bEnd] = b;
  const bDir = bEnd.clone().subtract(bStart);

  return angleIsAcute(aDir, bDir);
}

/// The vectors need not be normalized. A zero vector has no direction and counts as perpendicular to everything.
export function angleBetweenDegrees(a: Vector3, b: Vector3): number {
  return radiansToDegrees(a.angle(b));
}

// Computes whether the angle between the two vectors is "sharp" (less than 90 degrees).
export function angleIsAcute(a: Vector3, b: Vector3): boolean {
  return a.dot(b) > 0;
}

export function roundVector3(v: Vector3) {
  return mapVector3(v, Math.round);
}

export function mapVector3({ x, y, z }: Vector3, map: (v: number) => number): Vector3 {
  return new Vector3(map(x), map(y), map(z));
}

export function runningMedianDegrees(count: number) {
  const vec3Median = runningMedianVector3(count);

  return {
    update(degrees: number) {
      vec3Median.update(degreesToXz(degrees));
    },

    value(): number | null {
      const median = vec3Median.value();
      return median && xzDegrees(median);
    },
  };
}

export function runningMedianVector3(count: number) {
  const samples: Vector3[] = [];
  let value: Vector3 | null = null;

  return {
    update(newSample: Vector3) {
      if (samples.length < count) {
        samples.push(newSample);
      } else {
        samples[randomIndex(samples.length)] = newSample;
      }

      // TODO: make this part more performant
      value = computeMedian(samples)!;
    },

    value: () => value,
  };
}

function computeMedian(samples: Vector3[]): Vector3 | null {
  if (samples.length === 0) return null;

  function evalPoint(sample: Vector3) {
    return sum(samples.map((other) => other.distanceTo(sample)));
  }

  return findMinimumBy(samples, evalPoint) ?? null;
}
