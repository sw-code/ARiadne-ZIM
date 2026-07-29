import { expect, test, vi } from "vitest";
import { useTestDatabase } from "../testing/testDatabase.ts";
import { createPlaceImporter } from "./placeImport.ts";
import { listPlaces } from "./placeRepository.ts";
import type { ImportedPlace } from "./placeRepository.ts";

const db = useTestDatabase();

const placeNumbered = (number: number): ImportedPlace => ({
  id: `node-${number}`,
  category: "amenity",
  subtype: "bench",
  name: null,
  latitude: 51.5711,
  longitude: 8.106,
  tags: { amenity: "bench" },
});
const placesNumbered = (count: number): ImportedPlace[] =>
  Array.from({ length: count }, (_, index) => placeNumbered(index));

const firstImportAt = new Date("2026-10-01T00:00:00Z");
const secondImportAt = new Date("2026-10-02T00:00:00Z");

// Hands out the given dates one by one, one per import.
const clockReading = (...dates: Date[]) => {
  const remainingDates = [...dates];
  return () => remainingDates.shift() ?? firstImportAt;
};

test("first import stores everything", async () => {
  const importPlaces = createPlaceImporter(db(), async () => placesNumbered(3), clockReading(firstImportAt));

  expect(await importPlaces()).toEqual({ importedPlaceCount: 3, newlyGonePlaceCount: 0, goneMarkingSkipped: false });
  expect(await listPlaces(db())).toHaveLength(3);
});

test("a place missing from the next import is marked gone", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));
  fetchPlaces.mockResolvedValueOnce(placesNumbered(10));
  await importPlaces();

  fetchPlaces.mockResolvedValueOnce(placesNumbered(9));
  const result = await importPlaces();

  expect(result).toEqual({ importedPlaceCount: 9, newlyGonePlaceCount: 1, goneMarkingSkipped: false });
  expect((await listPlaces(db())).filter((place) => place.gone).map((place) => place.id)).toEqual(["node-9"]);
});

test("an implausibly small import marks nothing gone", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));
  fetchPlaces.mockResolvedValueOnce(placesNumbered(10));
  await importPlaces();

  fetchPlaces.mockResolvedValueOnce(placesNumbered(4));
  const result = await importPlaces();

  expect(result).toEqual({ importedPlaceCount: 4, newlyGonePlaceCount: 0, goneMarkingSkipped: true });
  expect((await listPlaces(db())).map((place) => place.gone)).toEqual(Array(10).fill(false));
});

test("an import at exactly the plausible share still marks places gone", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));
  fetchPlaces.mockResolvedValueOnce(placesNumbered(10));
  await importPlaces();

  fetchPlaces.mockResolvedValueOnce(placesNumbered(5));
  const result = await importPlaces();

  expect(result).toEqual({ importedPlaceCount: 5, newlyGonePlaceCount: 5, goneMarkingSkipped: false });
});

test("leaving out the 35 Stolpersteine of Soest's 1,738 places is plausible and marks them gone", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));
  fetchPlaces.mockResolvedValueOnce(placesNumbered(1_738));
  await importPlaces();

  fetchPlaces.mockResolvedValueOnce(placesNumbered(1_738 - 35));
  const result = await importPlaces();

  expect(result).toEqual({ importedPlaceCount: 1_703, newlyGonePlaceCount: 35, goneMarkingSkipped: false });
});

test("a failing fetch changes nothing and rejects", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));
  fetchPlaces.mockResolvedValueOnce(placesNumbered(10));
  await importPlaces();
  const placesBefore = await listPlaces(db());

  fetchPlaces.mockRejectedValueOnce(new Error("Overpass answered with HTTP 504"));

  await expect(importPlaces()).rejects.toThrow("HTTP 504");
  expect(await listPlaces(db())).toEqual(placesBefore);
});

test("concurrent calls share one run", async () => {
  let resolveFetch: (fetchedPlaces: ImportedPlace[]) => void = () => {};
  const fetchPlaces = vi.fn(() => new Promise<ImportedPlace[]>((resolve) => (resolveFetch = resolve)));
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt, secondImportAt));

  const firstCall = importPlaces();
  const secondCall = importPlaces();
  resolveFetch(placesNumbered(3));

  expect(await firstCall).toEqual({ importedPlaceCount: 3, newlyGonePlaceCount: 0, goneMarkingSkipped: false });
  expect(await secondCall).toBe(await firstCall);
  expect(fetchPlaces).toHaveBeenCalledTimes(1);

  const thirdCall = importPlaces();
  resolveFetch(placesNumbered(3));
  await thirdCall;
  expect(fetchPlaces).toHaveBeenCalledTimes(2);
});

test("after a failed run the next call starts a new run", async () => {
  const fetchPlaces = vi.fn<() => Promise<ImportedPlace[]>>();
  const importPlaces = createPlaceImporter(db(), fetchPlaces, clockReading(firstImportAt));
  fetchPlaces.mockRejectedValueOnce(new Error("Overpass answered with HTTP 504"));
  await expect(importPlaces()).rejects.toThrow("HTTP 504");

  fetchPlaces.mockResolvedValueOnce(placesNumbered(3));

  expect(await importPlaces()).toEqual({ importedPlaceCount: 3, newlyGonePlaceCount: 0, goneMarkingSkipped: false });
});
