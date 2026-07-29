import { expect, test } from "vitest";
import { useTestDatabase } from "../testing/testDatabase.ts";
import { countPresentPlaces, listPlaces, markPlacesUnseenSinceAsGone, upsertPlaces } from "./placeRepository.ts";
import type { ImportedPlace } from "./placeRepository.ts";

const db = useTestDatabase();

const cafe: ImportedPlace = {
  id: "node-1",
  category: "amenity",
  subtype: "cafe",
  name: "Café am Markt",
  latitude: 51.5711,
  longitude: 8.106,
  tags: { amenity: "cafe", "addr:street": "Markt", "addr:housenumber": "12" },
};
const bench: ImportedPlace = {
  id: "node-2",
  category: "amenity",
  subtype: "bench",
  name: null,
  latitude: 51.5712,
  longitude: 8.107,
  tags: { amenity: "bench" },
};

const firstImportAt = new Date("2026-10-01T00:00:00Z");
const secondImportAt = new Date("2026-10-02T00:00:00Z");
const thirdImportAt = new Date("2026-10-03T00:00:00Z");

test("upsert inserts, then updates in place", async () => {
  await upsertPlaces(db(), [cafe], firstImportAt);
  await upsertPlaces(db(), [{ ...cafe, name: "Café am Markt – Landbäckerei Sommer" }], secondImportAt);

  expect(await listPlaces(db())).toEqual([
    expect.objectContaining({
      id: "node-1",
      name: "Café am Markt – Landbäckerei Sommer",
      address: "Markt 12",
      gone: false,
    }),
  ]);
});

test("upserting no places is a no-op", async () => {
  await upsertPlaces(db(), [], firstImportAt);

  expect(await listPlaces(db())).toEqual([]);
});

const generatedPlaces = (count: number): ImportedPlace[] =>
  Array.from({ length: count }, (_, index) => ({ ...bench, id: `node-${index}` }));

test("upserts more places than fit into one insert statement", async () => {
  // 8 bind parameters per place: 10,000 places exceed Postgres' limit of 65,535 for a single statement.
  const placeCountBeyondBindParameterLimit = 10_000;

  await upsertPlaces(db(), generatedPlaces(placeCountBeyondBindParameterLimit), firstImportAt);

  expect(await countPresentPlaces(db())).toBe(placeCountBeyondBindParameterLimit);
});

test("a failing batch leaves the table unchanged", async () => {
  const placeCountSpanningTwoBatches = 1_500;
  const places = generatedPlaces(placeCountSpanningTwoBatches);
  // Postgres rejects an upsert that touches the same row twice in one statement, so only the last batch fails.
  const duplicateOfLastPlace = { ...bench, id: `node-${placeCountSpanningTwoBatches - 1}` };

  await expect(upsertPlaces(db(), [...places, duplicateOfLastPlace], firstImportAt)).rejects.toThrow();

  expect(await countPresentPlaces(db())).toBe(0);
});

test("address is null without a street", async () => {
  await upsertPlaces(db(), [bench], firstImportAt);

  expect(await listPlaces(db())).toEqual([expect.objectContaining({ id: "node-2", address: null })]);
});

test("address is just the street without a house number", async () => {
  await upsertPlaces(db(), [{ ...cafe, tags: { amenity: "cafe", "addr:street": "Markt" } }], firstImportAt);

  expect(await listPlaces(db())).toEqual([expect.objectContaining({ address: "Markt" })]);
});

test("places are listed by name with unnamed ones last", async () => {
  await upsertPlaces(db(), [bench, cafe, { ...cafe, id: "node-3", name: "Bäckerei" }], firstImportAt);

  expect((await listPlaces(db())).map((place) => place.id)).toEqual(["node-3", "node-1", "node-2"]);
});

test("places not seen in the latest import are marked gone, once", async () => {
  await upsertPlaces(db(), [cafe, bench], firstImportAt);
  await upsertPlaces(db(), [cafe], secondImportAt);

  expect(await markPlacesUnseenSinceAsGone(db(), secondImportAt)).toBe(1);
  expect(await listPlaces(db())).toEqual([
    expect.objectContaining({ id: "node-1", gone: false }),
    expect.objectContaining({ id: "node-2", gone: true }),
  ]);
  expect(await countPresentPlaces(db())).toBe(1);
  expect(await markPlacesUnseenSinceAsGone(db(), secondImportAt)).toBe(0);
});

test("a gone place that reappears is present again", async () => {
  await upsertPlaces(db(), [cafe, bench], firstImportAt);
  await upsertPlaces(db(), [cafe], secondImportAt);
  await markPlacesUnseenSinceAsGone(db(), secondImportAt);

  await upsertPlaces(db(), [cafe, bench], thirdImportAt);

  expect(await listPlaces(db())).toEqual([
    expect.objectContaining({ id: "node-1", gone: false }),
    expect.objectContaining({ id: "node-2", gone: false }),
  ]);
});
