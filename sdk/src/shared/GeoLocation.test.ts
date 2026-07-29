import { distanceMetres, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";

describe("distanceMetres", () => {
  test("distanceMetres measures 1 km of latitude within 5 m", () => {
    const southPoint = geoCoordsFromLatLongDegrees(51.57, 8.1);
    // One degree of latitude is about 111.2 km everywhere on Earth.
    const kilometreNorth = geoCoordsFromLatLongDegrees(51.57 + 1 / 111.2, 8.1);

    expect(Math.abs(distanceMetres(southPoint, kilometreNorth) - 1000)).toBeLessThan(5);
  });
});
