import { createWalkEncounters } from "@/src/3d/walkEncounters";
import { OverpassPointOfInterestCategory, PointOfInterest } from "@/src/shared/poi";

function placeOf(id: string, category: OverpassPointOfInterestCategory, subtype: string): PointOfInterest {
  return {
    id,
    category,
    subtype,
    location: { coordinate: { latitudeDegrees: 0, longitudeDegrees: 0 }, headingDegrees: 0 },
  };
}

const cafe = placeOf("cafe-1", "amenity", "cafe");
const otherCafe = placeOf("cafe-2", "amenity", "cafe");
const bakery = placeOf("bakery-1", "shop", "bakery");
const pharmacy = placeOf("pharmacy-1", "amenity", "pharmacy");
const hospital = placeOf("hospital-1", "healthcare", "hospital");

function newProfile() {
  return { recordShown: jest.fn(), recordEngaged: jest.fn() };
}

describe("createWalkEncounters", () => {
  test("a place counts as shown once per walk however often it comes into view", () => {
    const profile = newProfile();
    const encounters = createWalkEncounters(profile);

    encounters.shown(cafe);
    encounters.shown(cafe);
    encounters.shown(cafe);
    encounters.shown(otherCafe);

    expect(profile.recordShown).toHaveBeenCalledTimes(2);
    expect(profile.recordShown).toHaveBeenCalledWith(cafe);
    expect(profile.recordShown).toHaveBeenCalledWith(otherCafe);
    expect(encounters.tally()).toEqual({ cafe: { shown: 2, engaged: 0 } });
  });

  test("engaging with a place not yet shown counts it as shown first", () => {
    const profile = newProfile();
    const encounters = createWalkEncounters(profile);

    encounters.engaged(cafe);
    encounters.engaged(cafe);
    encounters.shown(cafe);

    expect(profile.recordShown).toHaveBeenCalledTimes(1);
    expect(profile.recordEngaged).toHaveBeenCalledTimes(1);
    expect(profile.recordShown.mock.invocationCallOrder[0]).toBeLessThan(
      profile.recordEngaged.mock.invocationCallOrder[0]!,
    );
    expect(encounters.tally()).toEqual({ cafe: { shown: 1, engaged: 1 } });
  });

  test("the tally holds only this walk and no sensitive kinds", () => {
    const profile = newProfile();
    const previousWalk = createWalkEncounters(profile);
    previousWalk.engaged(bakery);

    const encounters = createWalkEncounters(profile);
    encounters.shown(cafe);
    encounters.shown(pharmacy);
    encounters.engaged(hospital);
    const tallyBeforeMore = encounters.tally();
    encounters.engaged(cafe);

    expect(tallyBeforeMore).toEqual({ cafe: { shown: 1, engaged: 0 } });
    expect(encounters.tally()).toEqual({ cafe: { shown: 1, engaged: 1 } });
    expect(profile.recordShown).not.toHaveBeenCalledWith(pharmacy);
    expect(profile.recordShown).not.toHaveBeenCalledWith(hospital);
    expect(profile.recordEngaged).not.toHaveBeenCalledWith(hospital);
  });
});
