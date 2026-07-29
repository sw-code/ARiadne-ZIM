import { RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import { displayedPlaces, engageOnce, placeAtDestination, pressedPlace } from "@/src/ui/pages/routePreviewPlaces";
import type { GeoCoordinate } from "@/src/shared/GeoLocation";
import { enumerate } from "@/src/shared/JavascriptExtensions";

const metresPerDegreeOfLatitude = 111_195;

const northOf = ({ latitudeDegrees, longitudeDegrees }: GeoCoordinate, metres: number): GeoCoordinate => ({
  latitudeDegrees: latitudeDegrees + metres / metresPerDegreeOfLatitude,
  longitudeDegrees,
});

const somewhere: GeoCoordinate = { latitudeDegrees: 51.5, longitudeDegrees: 7.4 };

function placeWithId(id: string, coordinate: GeoCoordinate = somewhere): RankedPointOfInterest {
  return {
    id,
    category: "amenity",
    subtype: "cafe",
    score: 1,
    isAnnotated: false,
    location: { coordinate, headingDegrees: 0 },
  };
}

const cafe = placeWithId("node-1");
const bench = placeWithId("node-2");

describe("pressedPlace", () => {
  it("a marker press finds its place by id", () => {
    expect(pressedPlace([cafe, bench], [{ id: "node-2" }])).toBe(bench);
  });

  it("takes the first of several markers under the finger that belong to a place", () => {
    expect(pressedPlace([cafe, bench], [{ id: "intersection-0" }, { id: "node-2" }, { id: "node-1" }])).toBe(bench);
  });

  it("finds nothing when no pressed feature is one of the places", () => {
    expect(pressedPlace([cafe], [])).toBeUndefined();
    expect(pressedPlace([cafe], [{ id: "node-9" }, {}])).toBeUndefined();
  });
});

describe("engageOnce", () => {
  it("pressing the same marker twice engages once", () => {
    const engagedPlaceIds = new Set<string>();
    const recordEngaged = jest.fn();

    engageOnce(engagedPlaceIds, cafe, recordEngaged);
    engageOnce(engagedPlaceIds, cafe, recordEngaged);

    expect(recordEngaged).toHaveBeenCalledTimes(1);
    expect(recordEngaged).toHaveBeenCalledWith(cafe);
  });

  it("engages each place once", () => {
    const engagedPlaceIds = new Set<string>();
    const recordEngaged = jest.fn();

    engageOnce(engagedPlaceIds, cafe, recordEngaged);
    engageOnce(engagedPlaceIds, bench, recordEngaged);

    expect(recordEngaged).toHaveBeenCalledTimes(2);
  });
});

describe("placeAtDestination", () => {
  it("the nearest place within 25 m of the destination is the navigated-to place; none beyond 25 m", () => {
    const destination = somewhere;
    const farther = placeWithId("farther", northOf(destination, 20));
    const nearest = placeWithId("nearest", northOf(destination, 5));
    const beyondRadius = placeWithId("beyond-radius", northOf(destination, 30));

    expect(placeAtDestination([farther, beyondRadius, nearest], destination)).toBe(nearest);
    expect(placeAtDestination([beyondRadius], destination)).toBeUndefined();
    expect(placeAtDestination([], destination)).toBeUndefined();
  });
});

describe("displayedPlaces", () => {
  const destination = somewhere;
  const awayFromDestination = northOf(destination, 500);
  const profiledPicks = enumerate(20).map((index) => ({
    ...placeWithId(`profiled-${index}`, awayFromDestination),
    score: 0.9,
  }));
  const ids = (places: RankedPointOfInterest[]) => places.map(({ id }) => id);

  it("a place near the destination that is not in the top 20 is used for matching but not displayed, unless it is the matched place", () => {
    const nearButNotMatched = { ...placeWithId("near-but-not-matched", northOf(destination, 60)), score: 0.1 };
    const matched = { ...placeWithId("matched", northOf(destination, 10)), score: 0.1 };
    const places = [nearButNotMatched, ...profiledPicks, matched];

    expect(placeAtDestination(places, destination)).toBe(matched);
    expect(ids(displayedPlaces(places, destination))).toEqual([...ids(profiledPicks), "matched"]);
  });

  it("annotated places are always displayed", () => {
    const annotated = { ...placeWithId("annotated", awayFromDestination), score: 0, isAnnotated: true };
    const places = [annotated, ...profiledPicks];

    expect(ids(displayedPlaces(places, destination))).toEqual(ids(places));
  });
});
