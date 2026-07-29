import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { Matrix4, Vector3 } from "@math.gl/core";
import { Ellipsoid } from "@math.gl/geospatial";
import { asNum3, arrayToVector3 } from "./math3d";

/// Computes local location relative to an observer at the specified `origin` coordinate.
/// Returns a function that returns a local vector with +x going east, +z going south, +y going up.
/// This uses an accurate "ECEF" and "ENU" coordinate spaces (avoids spatial distortion common in web mercator or other projections).
export function geoCoordinateToLocalPositionConverter(
  origin: GeoCoordinate,
): (pointOfInterest: GeoCoordinate) => Vector3 {
  const cartographicOrigin = [origin.longitudeDegrees, origin.latitudeDegrees, origin.altitudeMetersFromEllipsoid ?? 0];

  const originCartesian = arrayToVector3(Ellipsoid.WGS84.cartographicToCartesian(cartographicOrigin));

  // rotate global-cartesian to local-cartesian
  const globalToLocal = Ellipsoid.WGS84.eastNorthUpToFixedFrame(originCartesian, new Matrix4()).invert();

  return function geoCoordinateToLocalPosition(pointOfInterest: GeoCoordinate): Vector3 {
    const cartographicPoi = [
      pointOfInterest.longitudeDegrees,
      pointOfInterest.latitudeDegrees,
      pointOfInterest.altitudeMetersFromEllipsoid ?? 0,
    ];
    const poiCartesian = arrayToVector3(Ellipsoid.WGS84.cartographicToCartesian(cartographicPoi));
    const [east, north, up] = asNum3(poiCartesian.transformAsPoint(globalToLocal));
    return new Vector3(east, up, -north);
  };
}
