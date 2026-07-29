import { expect, test } from "vitest";
import type { LatLong, Poi, PoiAnnotation } from "../../shared/api.ts";
import type { PriorModel } from "./interest.ts";
import { rankPois } from "./ranking.ts";

const metresPerDegreeOfLatitude = 111_195;

const northOf = ({ latitude, longitude }: LatLong, metres: number): LatLong => ({
  latitude: latitude + metres / metresPerDegreeOfLatitude,
  longitude,
});

const eastOf = ({ latitude, longitude }: LatLong, metres: number): LatLong => ({
  latitude,
  longitude: longitude + metres / (metresPerDegreeOfLatitude * Math.cos((latitude * Math.PI) / 180)),
});

const start = { latitude: 51.57, longitude: 8.1 };
const destination = eastOf(start, 1_000);
const midway = eastOf(start, 500);

// Every subtype is equally interesting a priori, so that a test only sees the effects it is about.
const flatPrior: PriorModel = () => 0.2;

const offer: PoiAnnotation = { title: "Angebot", text: "Zwei zum Preis von einem.", validFrom: null, validTo: null };

const poi = (id: string, subtype: string, location: LatLong, annotations: PoiAnnotation[] = []): Poi => ({
  ...location,
  id,
  category: "amenity",
  subtype,
  name: null,
  annotations,
});

const idsOf = (pois: Poi[]) => pois.map(({ id }) => id);

test("returns every annotated place in the detour area and fills up with the 20 best other places", () => {
  const cafes = Array.from({ length: 25 }, (_, index) =>
    poi(`cafe-${index}`, "cafe", northOf(midway, 10 * (index + 1))),
  );
  const insurance = poi("insurance", "insurance", northOf(midway, 100), [offer]);

  const ranked = rankPois([...cafes, insurance], { start, destination }, flatPrior);

  expect(ranked).toHaveLength(21);
  expect(idsOf(ranked)).toContain("insurance");
  expect(idsOf(ranked)).not.toContain("cafe-24");
});

test("a place outside the detour budget is not returned", () => {
  const farCafe = poi("far-cafe", "cafe", northOf(start, 1_000));
  const farOffer = poi("far-offer", "cafe", northOf(start, 1_000), [offer]);

  expect(rankPois([farCafe, farOffer], { start, destination }, flatPrior)).toEqual([]);
});

test("a very short walk still sees nearby places", () => {
  const nearCafe = poi("near-cafe", "cafe", northOf(start, 90));
  const farCafe = poi("far-cafe", "cafe", northOf(start, 150));

  const ranked = rankPois([nearCafe, farCafe], { start, destination: start }, flatPrior);

  expect(idsOf(ranked)).toEqual(["near-cafe"]);
});

test("sensitive places are returned only with an annotation and score only the annotation bonus", () => {
  const pharmacy = poi("pharmacy", "pharmacy", midway);
  const annotatedPharmacy = poi("annotated-pharmacy", "pharmacy", midway, [offer]);
  const profile = { pharmacy: { shown: 9, engaged: 9 } };

  const ranked = rankPois([pharmacy, annotatedPharmacy], { start, destination, profile }, flatPrior);

  expect(ranked).toEqual([expect.objectContaining({ id: "annotated-pharmacy", score: 0.3 })]);
});

test("an annotation adds its bonus to the interest", () => {
  const annotatedCafe = poi("cafe", "cafe", midway, [offer]);

  const [ranked] = rankPois([annotatedCafe], { start, destination }, flatPrior);

  expect(ranked?.score).toBeCloseTo(0.5);
});

test("an annotated place is returned however low the profile rates its subtype", () => {
  const insurance = poi("insurance", "insurance", midway, [offer]);
  const profile = { insurance: { shown: 50, engaged: 0, choice: "less" as const } };

  const [ranked] = rankPois([insurance], { start, destination, profile }, flatPrior);

  expect(ranked).toEqual(expect.objectContaining({ id: "insurance" }));
  expect(ranked?.score).toBeCloseTo(0.3045, 3);
});

test("higher interest ranks first and equal scores prefer the smaller detour", () => {
  const farCafe = poi("far-cafe", "cafe", northOf(midway, 200));
  const nearCafe = poi("near-cafe", "cafe", northOf(midway, 20));
  const bar = poi("bar", "bar", northOf(midway, 100));
  const profile = { bar: { shown: 10, engaged: 10 } };

  const ranked = rankPois([farCafe, nearCafe, bar], { start, destination, profile }, flatPrior);

  expect(idsOf(ranked)).toEqual(["bar", "near-cafe", "far-cafe"]);
});

const lowInterestProfile = { insurance: { shown: 50, engaged: 0, choice: "less" as const } };

test("a low-interest place next to the destination is returned even beyond the top 20", () => {
  const cafes = Array.from({ length: 25 }, (_, index) =>
    poi(`cafe-${index}`, "cafe", northOf(midway, 10 * (index + 1))),
  );
  const insuranceAtDestination = poi("insurance-at-destination", "insurance", northOf(destination, 80));
  const insuranceBeyondCandidateRadius = poi("insurance-beyond", "insurance", northOf(destination, 120));

  const ranked = rankPois(
    [...cafes, insuranceAtDestination, insuranceBeyondCandidateRadius],
    { start, destination, profile: lowInterestProfile },
    flatPrior,
  );

  expect(idsOf(ranked)).toContain("insurance-at-destination");
  expect(idsOf(ranked)).not.toContain("insurance-beyond");
});

test("a place next to the destination is returned once and does not use up one of the top 20 places", () => {
  const cafes = Array.from({ length: 25 }, (_, index) =>
    poi(`cafe-${index}`, "cafe", northOf(midway, 10 * (index + 1))),
  );
  const cafeAtDestination = poi("cafe-at-destination", "cafe", northOf(destination, 60));
  const annotatedAtDestination = poi("annotated-at-destination", "insurance", northOf(destination, 60), [offer]);

  const ranked = rankPois([...cafes, cafeAtDestination, annotatedAtDestination], { start, destination }, flatPrior);

  expect(ranked).toHaveLength(22);
  expect(new Set(idsOf(ranked)).size).toBe(22);
});

test("a sensitive place next to the destination is not returned unless annotated", () => {
  const pharmacy = poi("pharmacy", "pharmacy", northOf(destination, 80));
  const annotatedPharmacy = poi("annotated-pharmacy", "pharmacy", northOf(destination, 80), [offer]);

  const ranked = rankPois([pharmacy, annotatedPharmacy], { start, destination }, flatPrior);

  expect(idsOf(ranked)).toEqual(["annotated-pharmacy"]);
});

// The detour budget is tightest when the walk starts where it ends: the minimum budget then only reaches half of itself
// away from the destination.
test("a place next to a destination that is also the start is still in the detour area", () => {
  const insuranceAtDestination = poi("insurance-at-destination", "insurance", northOf(destination, 99));

  const ranked = rankPois([insuranceAtDestination], { start: destination, destination }, flatPrior);

  expect(idsOf(ranked)).toEqual(["insurance-at-destination"]);
});
