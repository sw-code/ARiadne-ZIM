import { Vector3 } from "@math.gl/core";
import { useRef, useState } from "react";
import { AbsoluteTime, useTimeEffect } from "@/src/shared/ReactExtensions";

export function secondsToMillis(seconds: number): number {
  return seconds * 1000;
}

export function millisToSeconds(millis: number): number {
  return millis / 1000;
}

export const FULL_RADIAN = 2 * Math.PI;

export const DEGREES_PER_TURN = 360;
export const RADIANS_PER_TURN = 2 * Math.PI;
export const TURNS_PER_DEGREE = 1 / DEGREES_PER_TURN;
export const TURNS_PER_RADIAN = 1 / RADIANS_PER_TURN;
export const DEGREES_PER_RADIAN = DEGREES_PER_TURN / RADIANS_PER_TURN;
export const RADIANS_PER_DEGREE = RADIANS_PER_TURN / DEGREES_PER_TURN;

export function degreesToRadians(d: number): number {
  return d * RADIANS_PER_DEGREE;
}

export function radiansToDegrees(r: number): number {
  return r * DEGREES_PER_RADIAN;
}

export function degreesToTurns(d: number): number {
  return d * TURNS_PER_DEGREE;
}

export function radiansToTurns(r: number): number {
  return r * TURNS_PER_RADIAN;
}

export function turnsToDegrees(t: number): number {
  return t * DEGREES_PER_TURN;
}

export function turnsToRadians(t: number): number {
  return t * RADIANS_PER_TURN;
}

const QUARTER_RADIAN = 0.25 * FULL_RADIAN;

// In math, 0° is to the right and direction is counter clockwise.
// But we want 0° to be up, and direction to be clockwise.
export function mathRadiansToClockRadians(angle: number): number {
  return wrap(QUARTER_RADIAN - angle, FULL_RADIAN);
}

// In math, 0° is to the right and direction is counter clockwise.
// But we want 0° to be up, and direction to be clockwise.
export function clockRadiansToMathRadians(angle: number): number {
  return wrap(QUARTER_RADIAN - angle, FULL_RADIAN);
}

// In math, 0° is to the right and direction is counter clockwise.
// But we want 0° to be up, and direction to be clockwise.
export function mathDegreesToClockDegrees(angle: number): number {
  return wrap(90 - angle, 360);
}

// In math, 0° is to the right and direction is counter clockwise.
// But we want 0° to be up, and direction to be clockwise.
export function clockDegreesToMathDegrees(angle: number): number {
  return wrap(90 - angle, 360);
}

export function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

/// The rotation from `from` to `to` the short way round, in (-180, 180].
export function signedDegreesBetween(from: number, to: number): number {
  const delta = wrap(to - from, 360);
  return delta > 180 ? delta - 360 : delta;
}

// From https://gist.github.com/shaunlebron/8832585 comment
export function lerpDegrees(from: number, to: number, factor: number): number {
  const delta = wrap(to - from, 360);
  const target = from + (delta > 180 ? delta - 360 : delta) * factor;
  return wrap(target, 360);
}

export function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

type Math<T> = {
  sub: (a: T, b: T) => T;
  scale: (a: T, b: number) => T;
  zero: () => T;
};

export const NumberMath: Math<number> = {
  sub: (a, b) => a - b,
  scale: (a, b) => a * b,
  zero: () => 0,
};

export const Vector3Math: Math<Vector3> = {
  sub: (a, b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z),
  scale: (a, b) => new Vector3(a.x * b, a.y * b, a.z * b),
  zero: () => new Vector3(0, 0, 0),
};

export const VectorOrNull3Math: Math<Vector3 | null> = {
  sub: (a, b) => a && b && Vector3Math.sub(a, b),
  scale: (a, b) => a && Vector3Math.scale(a, b),
  zero: () => Vector3Math.zero(),
};

export function useRateOfChangeNumber(current: number, time: AbsoluteTime): number {
  return useRateOfChange(current, NumberMath, time);
}

export function useRateOfChangeVector3(current: Vector3, time: AbsoluteTime): Vector3 {
  return useRateOfChange(current, Vector3Math, time);
}

export function useRateOfChangeVector3OrNull(current: Vector3 | null, time: AbsoluteTime): Vector3 | null {
  return useRateOfChange(current, VectorOrNull3Math, time);
}

export function useRateOfChange<T>(current: T, math: Math<T>, time: AbsoluteTime): T {
  const prev = useRef(current);
  const [deriv, setDeriv] = useState(math.zero());

  useTimeEffect(time, (dt) => {
    setDeriv(math.scale(math.sub(current, prev.current), 1 / dt.seconds));
    prev.current = current;
  });

  return deriv;
}

export function weightedSum(...weightedNumbers: [number, number][]): number {
  const weightsSum = weightedNumbers.reduce((sum, [_, weight]) => sum + weight, 0);
  if (weightsSum === 0) {
    return 0;
  }
  return weightedNumbers.reduce((sum, [num, weight]) => sum + num * weight, 0) / weightsSum;
}

export function weightedMedian(input: { value: number; weight: number }[]): number | undefined {
  input = [...input].sort((a, b) => a.value - b.value);

  const totalWeight = input.reduce((sum, { weight }) => sum + weight, 0);

  let cumulativeWeight = 0;
  for (const { value, weight } of input) {
    cumulativeWeight += weight;
    if (cumulativeWeight > totalWeight / 2) {
      return value;
    }
  }

  return undefined;
}

export function median(input: number[]): number | undefined {
  input = [...input].sort((a, b) => a - b);
  return input[Math.floor(input.length / 2)];
}

/// Unlike `median`, which picks the upper middle value, this is the median as statistics defines it.
export function statisticalMedian(input: number[]): number | undefined {
  const sorted = [...input].sort((a, b) => a - b);
  const upper = sorted[Math.floor(sorted.length / 2)];
  const lower = sorted[Math.ceil(sorted.length / 2) - 1];
  return upper === undefined || lower === undefined ? undefined : (upper + lower) / 2;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function mutatingSortBy<T>(array: T[], property: (elem: T) => number) {
  array.sort((a, b) => property(a) - property(b));
}

export function remapRange(
  value: number,
  oldRange: { from: number; to: number },
  newRange: { from: number; to: number },
): number {
  const oldSpan = oldRange.to - oldRange.from;
  if (oldSpan === 0) {
    // Avoid division by zero when the input range has zero length.
    // In this degenerate case, map to the start of the new range.
    return newRange.from;
  }

  const newSpan = newRange.to - newRange.from;
  return ((value - oldRange.from) * newSpan) / oldSpan + newRange.from;
}
