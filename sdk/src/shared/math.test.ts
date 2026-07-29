import {
  degreesToRadians,
  degreesToTurns,
  radiansToDegrees,
  radiansToTurns,
  turnsToDegrees,
  turnsToRadians,
  secondsToMillis,
  millisToSeconds,
  mathRadiansToClockRadians,
  clockRadiansToMathRadians,
  wrap,
  lerpDegrees,
  signedDegreesBetween,
  statisticalMedian,
  weightedSum,
  weightedMedian,
  median,
  clamp,
  mutatingSortBy,
  remapRange,
} from "./math";
import { toBeDeepCloseTo, toMatchCloseTo } from "jest-matcher-deep-close-to";
expect.extend({ toBeDeepCloseTo, toMatchCloseTo });

describe("math", () => {
  const TWO_PI = 2 * Math.PI;

  describe("time conversions", () => {
    it("seconds -> milliseconds", () => {
      expect(secondsToMillis(1)).toBeCloseTo(1000);
      expect(secondsToMillis(0.5)).toBeCloseTo(500);
    });

    it("milliseconds -> seconds", () => {
      expect(millisToSeconds(1000)).toBeCloseTo(1);
      expect(millisToSeconds(500)).toBeCloseTo(0.5);
    });
  });

  describe("angle conversions", () => {
    it("degrees -> radians", () => {
      expect(degreesToRadians(180)).toBeCloseTo(TWO_PI / 2);
      expect(degreesToRadians(90)).toBeCloseTo(TWO_PI / 4);
    });

    it("radians -> degrees", () => {
      expect(radiansToDegrees(TWO_PI / 2)).toBeCloseTo(180);
      expect(radiansToDegrees(TWO_PI / 4)).toBeCloseTo(90);
    });

    it("turns -> degrees", () => {
      expect(turnsToDegrees(0.5)).toBeCloseTo(180);
      expect(turnsToDegrees(0.25)).toBeCloseTo(90);
    });

    it("degrees -> turns", () => {
      expect(degreesToTurns(180)).toBeCloseTo(0.5);
      expect(degreesToTurns(90)).toBeCloseTo(0.25);
    });

    it("radians -> turns", () => {
      expect(radiansToTurns(TWO_PI / 2)).toBeCloseTo(0.5);
      expect(radiansToTurns(TWO_PI / 4)).toBeCloseTo(0.25);
    });

    it("turns -> radians", () => {
      expect(turnsToRadians(0.5)).toBeCloseTo(TWO_PI / 2);
      expect(turnsToRadians(0.25)).toBeCloseTo(TWO_PI / 4);
    });
  });

  it("math angle <-> clock angle", () => {
    expect(mathRadiansToClockRadians(0)).toBeCloseTo(0.25 * TWO_PI);

    for (const clockAngle of [0, 0.25, 2.3]) {
      const mathAngle = clockRadiansToMathRadians(clockAngle);
      const clockAngle2 = mathRadiansToClockRadians(mathAngle);
      expect(wrap(clockAngle2, TWO_PI)).toBeCloseTo(wrap(clockAngle, TWO_PI));
    }
  });

  it("wraps by 5", () => {
    expect(wrap(25, 5)).toBeCloseTo(0);
    expect(wrap(0, 5)).toBeCloseTo(0);

    expect(wrap(26, 5)).toBeCloseTo(1);
    expect(wrap(24, 5)).toBeCloseTo(4);

    expect(wrap(-4, 5)).toBeCloseTo(1);
    expect(wrap(-26, 5)).toBeCloseTo(4);
  });

  it.each([
    [0, 90, 0.5, 45],
    [0, 180, 0.25, 45],
    [0, 180, 1, 180],
  ])("lerps straightforward angles from %d to %d at %f → %d", (from, to, factor, expected) => {
    expect(lerpDegrees(from, to, factor)).toBeCloseTo(expected);
  });

  it.each([
    [350, 10, 0.5, 0],
    [350, 10, 0.25, 355],
    [350, 10, 1, 10],
  ])("lerps angles wrapping around from %d to %d at %f → %d", (from, to, factor, expected) => {
    expect(lerpDegrees(from, to, factor)).toBeCloseTo(wrap(expected, 360));
  });

  it.each([
    [10, 350, 0.5, 0],
    [10, 350, 0.25, 5],
    [10, 350, 1, 350],
  ])("lerps angles shortest path from %d to %d at %f → %d", (from, to, factor, expected) => {
    expect(lerpDegrees(from, to, factor)).toBeCloseTo(wrap(expected, 360));
  });

  it.each([
    [123, 456],
    [350, 10],
    [10, 350],
    [0, 720], // also tests big wrap
  ])("stays at endpoints from %d to %d", (from, to) => {
    expect(lerpDegrees(from, to, 0)).toBeCloseTo(wrap(from, 360));
    expect(lerpDegrees(from, to, 1)).toBeCloseTo(wrap(to, 360));
  });

  describe("weightedSum", () => {
    it("calculates weighted sum correctly", () => {
      expect(weightedSum([10, 1], [20, 2], [30, 3])).toBeCloseTo(23.333333);
    });

    it("handles single value", () => {
      expect(weightedSum([42, 5])).toBeCloseTo(42);
    });

    it("handles zero weight by returning 0", () => {
      expect(weightedSum([10, 0], [20, 0])).toBe(0);
    });

    it("ignores items with zero weight", () => {
      expect(weightedSum([10, 1], [20, 0], [30, 1])).toBeCloseTo(20);
    });

    it("handles negative weights", () => {
      expect(weightedSum([10, 1], [20, -1])).toBe(0);
    });

    it("handles empty array", () => {
      expect(weightedSum()).toBe(0);
    });
  });

  describe("weightedMedian", () => {
    it("returns weighted median for odd total weight", () => {
      const input = [
        { value: 10, weight: 1 },
        { value: 20, weight: 2 },
        { value: 30, weight: 1 },
      ];
      expect(weightedMedian(input)).toBe(20);
    });

    it("returns weighted median for even total weight", () => {
      const input = [
        { value: 10, weight: 1 },
        { value: 20, weight: 1 },
        { value: 30, weight: 1 },
        { value: 40, weight: 1 },
      ];
      expect(weightedMedian(input)).toBe(30);
    });

    it("handles single value", () => {
      expect(weightedMedian([{ value: 42, weight: 5 }])).toBe(42);
    });

    it("handles unsorted input", () => {
      const input = [
        { value: 30, weight: 1 },
        { value: 10, weight: 1 },
        { value: 20, weight: 2 },
      ];
      expect(weightedMedian(input)).toBe(20);
    });

    it("returns undefined for empty array", () => {
      expect(weightedMedian([])).toBeUndefined();
    });

    it("handles zero total weight", () => {
      const input = [
        { value: 10, weight: 0 },
        { value: 20, weight: 0 },
      ];
      expect(weightedMedian(input)).toBeUndefined();
    });
  });

  describe("median", () => {
    it("returns median for odd-length array", () => {
      expect(median([1, 2, 3, 4, 5])).toBe(3);
    });

    it("returns median for even-length array", () => {
      expect(median([1, 2, 3, 4])).toBe(3);
    });

    it("handles single value", () => {
      expect(median([42])).toBe(42);
    });

    it("handles unsorted input", () => {
      expect(median([5, 1, 3, 2, 4])).toBe(3);
    });

    it("returns undefined for empty array", () => {
      expect(median([])).toBeUndefined();
    });

    it("handles negative numbers", () => {
      expect(median([-10, -5, 0, 5, 10])).toBe(0);
    });
  });

  describe("clamp", () => {
    it("clamps value to max", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("clamps value to min", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("returns value when in range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("handles negative ranges", () => {
      expect(clamp(-15, -10, -5)).toBe(-10);
    });

    it("handles value at boundaries", () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe("mutatingSortBy", () => {
    it("sorts array by property", () => {
      const arr = [{ x: 3 }, { x: 1 }, { x: 2 }];
      mutatingSortBy(arr, (elem) => elem.x);
      expect(arr).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
    });

    it("sorts array by computed property", () => {
      const arr = [{ name: "c" }, { name: "a" }, { name: "b" }];
      mutatingSortBy(arr, (elem) => elem.name.charCodeAt(0));
      expect(arr).toEqual([{ name: "a" }, { name: "b" }, { name: "c" }]);
    });

    it("handles empty array", () => {
      const arr: { x: number }[] = [];
      mutatingSortBy(arr, (elem) => elem.x);
      expect(arr).toEqual([]);
    });

    it("handles single element", () => {
      const arr = [{ x: 42 }];
      mutatingSortBy(arr, (elem) => elem.x);
      expect(arr).toEqual([{ x: 42 }]);
    });

    it("handles negative numbers", () => {
      const arr = [{ x: 5 }, { x: -10 }, { x: 0 }];
      mutatingSortBy(arr, (elem) => elem.x);
      expect(arr).toEqual([{ x: -10 }, { x: 0 }, { x: 5 }]);
    });
  });

  describe("remapRange", () => {
    it("remaps value from one range to another", () => {
      expect(remapRange(5, { from: 0, to: 10 }, { from: 0, to: 100 })).toBeCloseTo(50);
    });

    it("remaps value at old range start", () => {
      expect(remapRange(0, { from: 0, to: 10 }, { from: 100, to: 200 })).toBeCloseTo(100);
    });

    it("remaps value at old range end", () => {
      expect(remapRange(10, { from: 0, to: 10 }, { from: 100, to: 200 })).toBeCloseTo(200);
    });

    it("handles negative ranges", () => {
      expect(remapRange(-5, { from: -10, to: 0 }, { from: 0, to: 100 })).toBeCloseTo(50);
    });

    it("handles inverted ranges", () => {
      expect(remapRange(5, { from: 0, to: 10 }, { from: 100, to: 0 })).toBeCloseTo(50);
    });

    it("handles floating point values", () => {
      expect(remapRange(2.5, { from: 0, to: 5 }, { from: 0, to: 1 })).toBeCloseTo(0.5);
    });

    it("handles zero-width old range", () => {
      // Division by zero case - maps to start of new range
      const result = remapRange(5, { from: 10, to: 10 }, { from: 0, to: 100 });
      expect(result).toBe(0);
    });

    it("extrapolates beyond old range", () => {
      expect(remapRange(15, { from: 0, to: 10 }, { from: 0, to: 100 })).toBeCloseTo(150);
    });
  });

  describe("signedDegreesBetween", () => {
    it("takes the short way across north", () => {
      expect(signedDegreesBetween(359, 1)).toBeCloseTo(2);
      expect(signedDegreesBetween(1, 359)).toBeCloseTo(-2);
    });

    it("stays within -180 and 180 for any input", () => {
      expect(signedDegreesBetween(10, 730)).toBeCloseTo(0);
      expect(signedDegreesBetween(0, 180)).toBeCloseTo(180);
      expect(signedDegreesBetween(0, -170)).toBeCloseTo(-170);
    });
  });

  describe("statisticalMedian", () => {
    it("averages the two middle values of an even count", () => {
      expect(statisticalMedian([4, 1, 3, 2])).toBe(2.5);
    });

    it("takes the middle value of an odd count and has none for no values", () => {
      expect(statisticalMedian([5, 1, 3])).toBe(3);
      expect(statisticalMedian([])).toBeUndefined();
    });
  });
});
