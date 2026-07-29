import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import type { AnnotationInput } from "../../shared/api.ts";
import { annotations } from "../database/schema.ts";
import { markPlacesUnseenSinceAsGone, upsertPlaces } from "../places/placeRepository.ts";
import type { ImportedPlace } from "../places/placeRepository.ts";
import { useTestDatabase } from "../testing/testDatabase.ts";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotatedPois,
  listAnnotations,
  placeExists,
  updateAnnotation,
} from "./annotationRepository.ts";

const db = useTestDatabase();

const cafe: ImportedPlace = {
  id: "node-1",
  category: "amenity",
  subtype: "cafe",
  name: "Café am Markt",
  latitude: 51.5711,
  longitude: 8.106,
  tags: { amenity: "cafe" },
};
const unnamedFastFood: ImportedPlace = {
  id: "node-2",
  category: "amenity",
  subtype: "fast_food",
  name: null,
  latitude: 51.5712,
  longitude: 8.107,
  tags: { amenity: "fast_food" },
};

const importedAt = new Date("2026-10-01T00:00:00Z");
const today = "2026-10-21";

const annotationOn = (placeId: string, overrides: Partial<AnnotationInput> = {}): AnnotationInput => ({
  placeId,
  title: "Kaffee und Kuchen",
  text: "Zwei Stück Kuchen zum Preis von einem.",
  validFrom: null,
  validTo: null,
  ...overrides,
});

test("a created annotation is listed with its place's name, subtype and presence", async () => {
  await upsertPlaces(db(), [cafe], importedAt);

  const created = await createAnnotation(db(), annotationOn("node-1", { validFrom: "2026-10-01" }));

  expect(created).toEqual({ id: expect.any(String), ...annotationOn("node-1", { validFrom: "2026-10-01" }) });
  expect(await listAnnotations(db())).toEqual([
    { ...created, placeName: "Café am Markt", placeSubtype: "cafe", placeGone: false },
  ]);
});

test("an annotation on an unnamed place lists no name, so the UI can fall back to the subtype", async () => {
  await upsertPlaces(db(), [unnamedFastFood], importedAt);
  await createAnnotation(db(), annotationOn("node-2"));

  expect(await listAnnotations(db())).toEqual([
    expect.objectContaining({ placeId: "node-2", placeName: null, placeSubtype: "fast_food" }),
  ]);
});

test("annotations are listed by start date with open starts first, then by title", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  await createAnnotation(db(), annotationOn("node-1", { title: "B", validFrom: "2026-10-05" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "C", validFrom: null }));
  await createAnnotation(db(), annotationOn("node-1", { title: "A", validFrom: "2026-10-05" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "D", validFrom: "2026-10-01" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "A", validFrom: null }));

  const listed = await listAnnotations(db());

  expect(listed.map(({ title, validFrom }) => [title, validFrom])).toEqual([
    ["A", null],
    ["C", null],
    ["D", "2026-10-01"],
    ["A", "2026-10-05"],
    ["B", "2026-10-05"],
  ]);
});

test("updating an annotation changes its fields, including the place", async () => {
  await upsertPlaces(db(), [cafe, unnamedFastFood], importedAt);
  const { id } = await createAnnotation(db(), annotationOn("node-1"));
  const changed = annotationOn("node-2", {
    title: "Neuer Titel",
    text: "Neuer Text",
    validFrom: "2026-11-01",
    validTo: "2026-11-30",
  });

  const updated = await updateAnnotation(db(), id, changed);

  expect(updated).toEqual({ id, ...changed });
  expect(await listAnnotations(db())).toEqual([expect.objectContaining({ id, ...changed, placeName: null })]);
});

test("updating an annotation sets updatedAt", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  const { id } = await createAnnotation(db(), annotationOn("node-1"));
  const longAgo = new Date("2020-01-01T00:00:00Z");
  await db().update(annotations).set({ updatedAt: longAgo }).where(eq(annotations.id, id));

  await updateAnnotation(db(), id, annotationOn("node-1"));

  const [row] = await db().select({ updatedAt: annotations.updatedAt }).from(annotations).where(eq(annotations.id, id));
  expect(row?.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
});

test("updating an unknown annotation returns null", async () => {
  await upsertPlaces(db(), [cafe], importedAt);

  expect(await updateAnnotation(db(), "00000000-0000-4000-8000-000000000000", annotationOn("node-1"))).toBeNull();
});

test("an annotation can be deleted once", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  const { id } = await createAnnotation(db(), annotationOn("node-1"));

  expect(await deleteAnnotation(db(), id)).toBe(true);
  expect(await deleteAnnotation(db(), id)).toBe(false);
  expect(await listAnnotations(db())).toEqual([]);
});

test("a place exists once it has been imported", async () => {
  await upsertPlaces(db(), [cafe], importedAt);

  expect(await placeExists(db(), "node-1")).toBe(true);
  expect(await placeExists(db(), "node-404")).toBe(false);
});

test("the app feed holds only the annotations active today", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  await createAnnotation(db(), annotationOn("node-1", { title: "aktiv" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "abgelaufen", validTo: "2026-10-20" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "geplant", validFrom: "2026-10-22" }));

  expect(await listAnnotatedPois(db(), today)).toEqual([
    {
      id: "node-1",
      category: "amenity",
      subtype: "cafe",
      name: "Café am Markt",
      latitude: 51.5711,
      longitude: 8.106,
      annotations: [{ title: "aktiv", text: "Zwei Stück Kuchen zum Preis von einem.", validFrom: null, validTo: null }],
    },
  ]);
});

test("the app feed has one entry per place, however many annotations are active", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  await createAnnotation(db(), annotationOn("node-1", { title: "B" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "A" }));

  const feed = await listAnnotatedPois(db(), today);

  expect(feed).toHaveLength(1);
  expect(feed[0]?.annotations.map(({ title }) => title)).toEqual(["A", "B"]);
});

test("the app feed is ordered by place id", async () => {
  await upsertPlaces(db(), [unnamedFastFood, cafe], importedAt);
  await createAnnotation(db(), annotationOn("node-2"));
  await createAnnotation(db(), annotationOn("node-1"));

  expect((await listAnnotatedPois(db(), today)).map(({ id }) => id)).toEqual(["node-1", "node-2"]);
});

test("a place without annotations is absent from the app feed", async () => {
  await upsertPlaces(db(), [cafe, unnamedFastFood], importedAt);
  await createAnnotation(db(), annotationOn("node-2"));

  expect((await listAnnotatedPois(db(), today)).map(({ id }) => id)).toEqual(["node-2"]);
});

test("a place whose annotations are all inactive is absent from the app feed", async () => {
  await upsertPlaces(db(), [cafe], importedAt);
  await createAnnotation(db(), annotationOn("node-1", { validTo: "2026-10-20" }));

  expect(await listAnnotatedPois(db(), today)).toEqual([]);
});

test("an annotation on a place that has left OSM is still served to the app and listed as gone", async () => {
  const laterImportAt = new Date("2026-10-02T00:00:00Z");
  await upsertPlaces(db(), [cafe, unnamedFastFood], importedAt);
  await createAnnotation(db(), annotationOn("node-1"));
  await upsertPlaces(db(), [unnamedFastFood], laterImportAt);
  await markPlacesUnseenSinceAsGone(db(), laterImportAt);

  expect(await listAnnotatedPois(db(), today)).toEqual([expect.objectContaining({ id: "node-1" })]);
  expect(await listAnnotations(db())).toEqual([expect.objectContaining({ placeId: "node-1", placeGone: true })]);
});
