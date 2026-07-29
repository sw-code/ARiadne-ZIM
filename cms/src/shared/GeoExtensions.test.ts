import { describe, expect, test } from "vitest";
import {
  distanceMetres,
  distanceToSegmentMetres,
  movedByMetres,
  offsetMetres,
  randomPointInDisc,
} from "./GeoExtensions.ts";
import { seededRandom } from "./JavascriptExtensions.ts";

const soest = { latitude: 51.57, longitude: 8.1 };

test("0.009 degrees of latitude are 1000 m", () => {
  const distance = distanceMetres(soest, { latitude: 51.579, longitude: 8.1 });

  expect(Math.abs(distance - 1_000)).toBeLessThan(5);
});

test("a degree of longitude is shorter than a degree of latitude by the cosine of the latitude", () => {
  const eastWest = distanceMetres(soest, { ...soest, longitude: 8.11 });
  const northSouth = distanceMetres(soest, { ...soest, latitude: 51.58 });

  expect(eastWest / northSouth).toBeCloseTo(Math.cos((soest.latitude * Math.PI) / 180), 3);
});

test("the distance is the same in both directions and zero from a point to itself", () => {
  const nearby = { latitude: 51.5712, longitude: 8.107 };

  expect(distanceMetres(soest, nearby)).toBe(distanceMetres(nearby, soest));
  expect(distanceMetres(soest, soest)).toBe(0);
});

test("a point moved east and north is as far away as the metres moved", () => {
  const moved = movedByMetres(soest, 300, 400);

  expect(distanceMetres(soest, moved)).toBeCloseTo(500, 6);
});

test("a point moved only east keeps its latitude, and one moved only north keeps its longitude", () => {
  expect(movedByMetres(soest, 1_000, 0).latitude).toBe(soest.latitude);
  expect(movedByMetres(soest, 0, 1_000).longitude).toBe(soest.longitude);
});

test("moving by negative metres goes west and south", () => {
  const moved = movedByMetres(soest, -1_000, -1_000);

  expect(moved.longitude).toBeLessThan(soest.longitude);
  expect(moved.latitude).toBeLessThan(soest.latitude);
});

test("the offset of a moved point is the metres it was moved by", () => {
  const offset = offsetMetres(soest, movedByMetres(soest, 300, -400));

  expect(offset.eastMetres).toBeCloseTo(300, 6);
  expect(offset.northMetres).toBeCloseTo(-400, 6);
});

describe("distanceToSegmentMetres", () => {
  const start = soest;
  const end = movedByMetres(soest, 1_000, 0);

  test("a point beside the middle of the segment is as far from it as it is from the segment's line", () => {
    const beside = movedByMetres(soest, 500, 30);

    expect(distanceToSegmentMetres(beside, start, end)).toBeCloseTo(30, 3);
  });

  test("a point on the segment has no distance", () => {
    expect(distanceToSegmentMetres(movedByMetres(soest, 250, 0), start, end)).toBeCloseTo(0, 3);
  });

  test("a point beyond an end of the segment is as far from the segment as from that end", () => {
    expect(distanceToSegmentMetres(movedByMetres(soest, 1_100, 0), start, end)).toBeCloseTo(100, 3);
    expect(distanceToSegmentMetres(movedByMetres(soest, -30, 40), start, end)).toBeCloseTo(50, 3);
  });

  test("a segment from a point to itself is that point", () => {
    expect(distanceToSegmentMetres(movedByMetres(soest, 30, 40), soest, soest)).toBeCloseTo(50, 3);
  });
});

describe("randomPointInDisc", () => {
  const radiusMetres = 600;
  const random = seededRandom(1);
  const points = Array.from({ length: 2_000 }, () => randomPointInDisc(soest, radiusMetres, random));
  const distancesMetres = points.map((point) => distanceMetres(soest, point));

  test("all points lie within the radius", () => {
    expect(Math.max(...distancesMetres)).toBeLessThanOrEqual(radiusMetres + 1e-6);
  });

  test("the points are spread evenly over the area, so a quarter of them lie within half the radius", () => {
    const shareWithinHalfRadius =
      distancesMetres.filter((distance) => distance <= radiusMetres / 2).length / points.length;

    expect(shareWithinHalfRadius).toBeGreaterThan(0.22);
    expect(shareWithinHalfRadius).toBeLessThan(0.28);
  });
});
