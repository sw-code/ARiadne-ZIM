import { PointOfInterest, withPinnedPointOfInterest } from "@/src/shared/poi";

function placeWithId(id: string): PointOfInterest {
  return {
    id,
    category: "amenity",
    subtype: "cafe",
    location: { coordinate: { latitudeDegrees: 51.57, longitudeDegrees: 8.1 }, headingDegrees: 0 },
  };
}

describe("withPinnedPointOfInterest", () => {
  const nearest = [placeWithId("bakery"), placeWithId("fountain")];

  test("adds the pinned place when it is not among the nearest", () => {
    const museum = placeWithId("museum");

    expect(withPinnedPointOfInterest(nearest, museum)).toEqual([...nearest, museum]);
  });

  test("does not duplicate a pinned place that is already near", () => {
    expect(withPinnedPointOfInterest(nearest, placeWithId("fountain"))).toEqual(nearest);
  });

  test("no pinned place leaves the list unchanged", () => {
    expect(withPinnedPointOfInterest(nearest, null)).toEqual(nearest);
  });
});
