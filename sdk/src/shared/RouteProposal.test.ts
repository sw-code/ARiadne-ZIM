import { getRoute, Path } from "@/src/shared/Directions";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { degreesToRadians } from "@/src/shared/math";
import { RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import { proposeExploreRoute, routeScore } from "@/src/shared/RouteProposal";

jest.mock("@/src/shared/Directions", () => ({ getRoute: jest.fn() }));
// A failing via request is logged as a warning, which would otherwise be printed by the tests.
jest.mock("@/src/shared/Logger", () => ({ log: { warn: jest.fn() } }));

const getRouteMock = jest.mocked(getRoute);

const walkingSpeedMetresPerSecond = 1.3;
const metresPerDegreeOfLatitude = 111_195;

const start = geoCoordsFromLatLongDegrees(51.57, 8.1);
const destination = metresNorthAndEastOf(start, 1000, 0);
const midpoint = metresNorthAndEastOf(start, 500, 0);
const directPath = pathThrough([start, destination], { distanceMetres: 1000 });

function metresNorthAndEastOf(origin: GeoCoordinate, northMetres: number, eastMetres: number): GeoCoordinate {
  const metresPerDegreeOfLongitude = metresPerDegreeOfLatitude * Math.cos(degreesToRadians(origin.latitudeDegrees));
  return geoCoordsFromLatLongDegrees(
    origin.latitudeDegrees + northMetres / metresPerDegreeOfLatitude,
    origin.longitudeDegrees + eastMetres / metresPerDegreeOfLongitude,
  );
}

function pathThrough(
  coordinates: GeoCoordinate[],
  { distanceMetres, ascendMetres = 0 }: { distanceMetres: number; ascendMetres?: number },
): Path {
  return {
    distance: distanceMetres,
    ascend: ascendMetres,
    weight: 0,
    time: 0,
    transfers: 0,
    points_encoded: false,
    bbox: [],
    points: {
      type: "LineString",
      coordinates: coordinates.map(({ longitudeDegrees, latitudeDegrees }) => [longitudeDegrees, latitudeDegrees]),
    },
    instructions: [],
    details: {},
    descend: 0,
  };
}

function placeAt(id: string, coordinate: GeoCoordinate, score: number): RankedPointOfInterest {
  return {
    id,
    category: "amenity",
    subtype: "cafe",
    score,
    isAnnotated: false,
    location: { coordinate, headingDegrees: 0 },
  };
}

describe("routeScore", () => {
  test("a place within 40 m of the path adds its score, one 60 m away does not", () => {
    const nearbyPlace = placeAt("near", metresNorthAndEastOf(midpoint, 0, 30), 0.7);
    const distantPlace = placeAt("distant", metresNorthAndEastOf(midpoint, 0, 60), 0.4);

    const score = (places: RankedPointOfInterest[]) =>
      routeScore(directPath, places, directPath, walkingSpeedMetresPerSecond);

    expect(score([nearbyPlace])).toBeCloseTo(0.7);
    expect(score([distantPlace])).toBeCloseTo(0);
    expect(score([nearbyPlace, distantPlace])).toBeCloseTo(0.7);
  });

  test("each extra minute at the user's speed costs 0.1", () => {
    const longerPath = pathThrough([start, destination], { distanceMetres: 1390 });

    expect(routeScore(longerPath, [], directPath, 1.3)).toBeCloseTo(-0.5);
  });

  test("walkers below 1 m/s pay 0.01 per metre climbed, faster walkers do not", () => {
    const hillyPath = pathThrough([start, destination], { distanceMetres: 1000, ascendMetres: 50 });

    expect(routeScore(hillyPath, [], directPath, 0.9)).toBeCloseTo(-0.5);
    expect(routeScore(hillyPath, [], directPath, 1.0)).toBeCloseTo(0);
    expect(routeScore(hillyPath, [], directPath, 1.3)).toBeCloseTo(0);
  });
});

describe("proposeExploreRoute", () => {
  const eastOfMidpoint = metresNorthAndEastOf(midpoint, 0, 300);
  const westOfMidpoint = metresNorthAndEastOf(midpoint, 0, -300);
  const farEastOfMidpoint = metresNorthAndEastOf(midpoint, 0, 600);
  const farWestOfMidpoint = metresNorthAndEastOf(midpoint, 0, -600);

  const highestScoredPlace = placeAt("highest", eastOfMidpoint, 0.9);
  const secondPlace = placeAt("second", westOfMidpoint, 0.8);
  const thirdPlace = placeAt("third", farEastOfMidpoint, 0.7);
  const lowestScoredPlace = placeAt("lowest", farWestOfMidpoint, 0.1);
  const places = [lowestScoredPlace, thirdPlace, highestScoredPlace, secondPlace];

  function viaRoutes(distanceMetresByPlace: Map<RankedPointOfInterest, number>): Map<GeoCoordinate, Path> {
    return new Map(
      [...distanceMetresByPlace].map(([place, distanceMetres]) => [
        place.location.coordinate,
        pathThrough([start, place.location.coordinate, destination], { distanceMetres }),
      ]),
    );
  }

  function answerWith(routesByViaCoordinate: Map<GeoCoordinate, Path>) {
    getRouteMock.mockImplementation(async (_start, _destination, via = []) => {
      const path = routesByViaCoordinate.get(via[0]!);
      if (!path) throw new Error("No route");
      return { paths: [path] };
    });
  }

  beforeEach(() => {
    getRouteMock.mockReset();
  });

  test("requests via routes for the three best places and returns the best scoring route", async () => {
    // The highest scored place needs such a long detour that the second one is the better trip.
    const routes = viaRoutes(
      new Map([
        [highestScoredPlace, 3000],
        [secondPlace, 1100],
        [thirdPlace, 1300],
      ]),
    );
    answerWith(routes);

    const proposal = await proposeExploreRoute(start, destination, directPath, places, walkingSpeedMetresPerSecond);

    expect(getRouteMock.mock.calls).toEqual([
      [start, destination, [highestScoredPlace.location.coordinate]],
      [start, destination, [secondPlace.location.coordinate]],
      [start, destination, [thirdPlace.location.coordinate]],
    ]);
    expect(proposal).toEqual({ path: routes.get(secondPlace.location.coordinate), via: secondPlace });
  });

  test("keeps the direct route when no detour is worth its extra minutes", async () => {
    answerWith(
      viaRoutes(
        new Map([
          [highestScoredPlace, 3000],
          [secondPlace, 3000],
          [thirdPlace, 3000],
        ]),
      ),
    );

    const proposal = await proposeExploreRoute(start, destination, directPath, places, walkingSpeedMetresPerSecond);

    expect(proposal).toEqual({ path: directPath, via: null });
  });

  test("treats a failed via request as a missing candidate", async () => {
    const routes = viaRoutes(new Map([[thirdPlace, 1100]]));
    answerWith(routes);

    const proposal = await proposeExploreRoute(start, destination, directPath, places, walkingSpeedMetresPerSecond);

    expect(proposal).toEqual({ path: routes.get(thirdPlace.location.coordinate), via: thirdPlace });
  });

  test("falls back to the direct route when every via request fails", async () => {
    getRouteMock.mockRejectedValue(new Error("HTTP 500"));

    const proposal = await proposeExploreRoute(start, destination, directPath, places, walkingSpeedMetresPerSecond);

    expect(proposal).toEqual({ path: directPath, via: null });
  });
});
