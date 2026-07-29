import type { LatLong } from "./api.ts";
import { clamp } from "./JavascriptExtensions.ts";

const earthRadiusMetres = 6_371_000;

const radiansOf = (degrees: number) => (degrees * Math.PI) / 180;
const degreesOf = (radians: number) => (radians * 180) / Math.PI;

// Equirectangular approximation: the patch between two points is treated as flat, with longitude scaled by the
// cosine of the mean latitude. At city scale it is off by far less than the GPS error, so the more involved
// haversine formula would add nothing.
export function distanceMetres(a: LatLong, b: LatLong): number {
  const meanLatitudeRadians = radiansOf((a.latitude + b.latitude) / 2);
  const eastWestRadians = radiansOf(b.longitude - a.longitude) * Math.cos(meanLatitudeRadians);
  const northSouthRadians = radiansOf(b.latitude - a.latitude);
  return earthRadiusMetres * Math.hypot(eastWestRadians, northSouthRadians);
}

// The inverse of distanceMetres, with the same flat-patch approximation: the result is exactly as far from the point as
// the metres moved.
export function movedByMetres(point: LatLong, eastMetres: number, northMetres: number): LatLong {
  const latitude = point.latitude + degreesOf(northMetres / earthRadiusMetres);
  const meanLatitudeRadians = radiansOf((point.latitude + latitude) / 2);
  const longitudeShift = degreesOf(eastMetres / (earthRadiusMetres * Math.cos(meanLatitudeRadians)));
  return { latitude, longitude: point.longitude + longitudeShift };
}

// The inverse of movedByMetres: how far east and north the point lies from the origin, with the same flat-patch
// approximation.
export function offsetMetres(origin: LatLong, point: LatLong): { eastMetres: number; northMetres: number } {
  const meanLatitudeRadians = radiansOf((origin.latitude + point.latitude) / 2);
  return {
    eastMetres: earthRadiusMetres * radiansOf(point.longitude - origin.longitude) * Math.cos(meanLatitudeRadians),
    northMetres: earthRadiusMetres * radiansOf(point.latitude - origin.latitude),
  };
}

// Measured in the flat frame of the segment's start, in which the patch of a walk is as exact as distanceMetres.
export function distanceToSegmentMetres(point: LatLong, segmentStart: LatLong, segmentEnd: LatLong): number {
  const segment = offsetMetres(segmentStart, segmentEnd);
  const pointOffset = offsetMetres(segmentStart, point);
  const segmentLengthSquaredMetres = segment.eastMetres ** 2 + segment.northMetres ** 2;
  // A segment from a point to itself has no direction to project on, and its nearest point is that point.
  const nearestShareAlongSegment =
    segmentLengthSquaredMetres === 0
      ? 0
      : clamp(
          (pointOffset.eastMetres * segment.eastMetres + pointOffset.northMetres * segment.northMetres) /
            segmentLengthSquaredMetres,
          0,
          1,
        );
  return Math.hypot(
    pointOffset.eastMetres - nearestShareAlongSegment * segment.eastMetres,
    pointOffset.northMetres - nearestShareAlongSegment * segment.northMetres,
  );
}

export function randomPointInDisc(centre: LatLong, radiusMetres: number, random: () => number): LatLong {
  // The square root spreads the points evenly over the area of the disc instead of crowding them at its centre.
  const distanceFromCentreMetres = radiusMetres * Math.sqrt(random());
  const bearingRadians = 2 * Math.PI * random();
  return movedByMetres(
    centre,
    distanceFromCentreMetres * Math.sin(bearingRadians),
    distanceFromCentreMetres * Math.cos(bearingRadians),
  );
}
