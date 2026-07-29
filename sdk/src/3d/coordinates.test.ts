import { Vector3 } from "@math.gl/core";
import { geoCoordinateToLocalPositionConverter } from "./coordinates";

const cinema = {
  // UFA kino am hauptbahnhof düsseldorf
  latitudeDegrees: 51.221220517969016,
  longitudeDegrees: 6.794253987476834,
  altitudeMetersFromEllipsoid: 38.0,
};

const cafe = {
  // kyoto cafe am hauptbahnhof düsseldorf
  latitudeDegrees: 51.2214167196814,
  longitudeDegrees: 6.792806980666593,
  altitudeMetersFromEllipsoid: 38.0,
};

const sculpture = {
  // bertha von suttner platz am hauptbahnhof düsseldorf
  latitudeDegrees: 51.21881479997007,
  longitudeDegrees: 6.79570586985319,
  altitudeMetersFromEllipsoid: 38.0,
};

it("computes known east/north distance from cinema to cafe", () => {
  const origin = cinema;
  const target = cafe;
  const eastMeters = -95;
  const northMeters = 21;

  const localCoord = geoCoordinateToLocalPositionConverter(origin)(target);
  const expectedLocalCoord = new Vector3(eastMeters, 0, -northMeters);
  expect(localCoord.distanceTo(expectedLocalCoord)).toBeLessThan(8);
});

it("computes known east/north distance from cinema to sculpture", () => {
  const origin = cinema;
  const target = sculpture;
  const eastMeters = 117;
  const northMeters = -270;

  const localCoord = geoCoordinateToLocalPositionConverter(origin)(target);
  const expectedLocalCoord = new Vector3(eastMeters, 0, -northMeters);
  expect(localCoord.distanceTo(expectedLocalCoord)).toBeLessThan(20);
});
