import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { maxAnnotationTextCharacters, maxAnnotationTitleCharacters } from "../shared/annotationLimits.ts";
import type { AnnotationInput, ImportResult } from "../shared/api.ts";
import { createAnnotation, listAnnotations } from "./annotations/annotationRepository.ts";
import { createApp } from "./app.ts";
import { upsertPlaces } from "./places/placeRepository.ts";
import type { ImportedPlace } from "./places/placeRepository.ts";
import { useTestDatabase } from "./testing/testDatabase.ts";

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

const importResult: ImportResult = { importedPlaceCount: 1, newlyGonePlaceCount: 0, goneMarkingSkipped: false };
const auth = { Authorization: "Basic " + btoa("redaktion:secret") };
const jsonHeaders = { ...auth, "Content-Type": "application/json" };
const unknownAnnotationId = "00000000-0000-4000-8000-000000000000";

const annotationOn = (placeId: string, overrides: Partial<AnnotationInput> = {}): AnnotationInput => ({
  placeId,
  title: "Kaffee und Kuchen",
  text: "Zwei Stück Kuchen zum Preis von einem.",
  validFrom: null,
  validTo: null,
  ...overrides,
});

let uiDistPath: string;
beforeAll(() => {
  uiDistPath = mkdtempSync(join(tmpdir(), "ariadne-cms-ui-"));
  writeFileSync(join(uiDistPath, "index.html"), "<!doctype html><title>Redaktion</title>");
  writeFileSync(join(uiDistPath, "app.js"), "console.info('ui');");
});
afterAll(() => rmSync(uiDistPath, { recursive: true }));

let app: Hono;
beforeEach(async () => {
  app = appImporting(async () => importResult);
  await upsertPlaces(db(), [cafe], new Date("2026-10-01T00:00:00Z"));
});
afterEach(() => vi.restoreAllMocks());

function appImporting(importPlaces: () => Promise<ImportResult>, now = new Date("2026-10-21T10:00:00Z")): Hono {
  return createApp({ db: db(), editorPassword: "secret", importPlaces, now: () => now, uiDistPath });
}

function sendJson(method: "POST" | "PUT", path: string, body: object) {
  return app.request(path, { method, headers: jsonHeaders, body: JSON.stringify(body) });
}

test("the health check and the annotated feed are public", async () => {
  expect((await app.request("/healthz")).status).toBe(200);
  expect(await app.request("/api/annotated-pois")).toHaveProperty("status", 200);
});

test("the annotated feed lists only annotations that are active today in Soest", async () => {
  await createAnnotation(db(), annotationOn("node-1", { title: "Abgelaufen", validTo: "2026-10-20" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "Läuft", validFrom: "2026-10-21" }));

  const feed = await (await app.request("/api/annotated-pois")).json();

  expect(feed).toEqual([
    expect.objectContaining({
      id: "node-1",
      annotations: [{ title: "Läuft", text: expect.any(String), validFrom: "2026-10-21", validTo: null }],
    }),
  ]);
});

test("an offer that ended on the 31st is gone after midnight in Soest although it is still the 31st in UTC", async () => {
  // 23:30 UTC on the 31st is already 00:30 on 1 November in Soest.
  app = appImporting(async () => importResult, new Date("2026-10-31T23:30:00Z"));
  await createAnnotation(db(), annotationOn("node-1", { title: "Endete am 31.10.", validTo: "2026-10-31" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "Endet am 1.11.", validTo: "2026-11-01" }));

  const feed = await (await app.request("/api/annotated-pois")).json();

  expect(feed).toEqual([
    expect.objectContaining({ annotations: [expect.objectContaining({ title: "Endet am 1.11." })] }),
  ]);
});

test("editor routes reject requests without credentials", async () => {
  const editorRoutes = [
    ["GET", "/api/places"],
    ["POST", "/api/places/import"],
    ["GET", "/api/annotations"],
    ["POST", "/api/annotations"],
    ["PUT", `/api/annotations/${unknownAnnotationId}`],
    ["DELETE", `/api/annotations/${unknownAnnotationId}`],
    ["GET", "/"],
  ] as const;

  for (const [method, path] of editorRoutes) {
    expect((await app.request(path, { method })).status, `${method} ${path}`).toBe(401);
  }
});

test("the sign-in prompt names the CMS in the realm", async () => {
  const response = await app.request("/api/annotations");

  expect(response.headers.get("WWW-Authenticate")).toBe('Basic realm="ARiadne CMS"');
});

test("a wrong password is rejected and the right one is accepted", async () => {
  const wrongPassword = { Authorization: "Basic " + btoa("redaktion:wrong") };

  expect((await app.request("/api/annotations", { headers: wrongPassword })).status).toBe(401);
  expect((await app.request("/api/annotations", { headers: auth })).status).toBe(200);
});

test("the place list is served to editors", async () => {
  const placeList = await (await app.request("/api/places", { headers: auth })).json();

  expect(placeList).toEqual([expect.objectContaining({ id: "node-1", name: "Café am Markt", gone: false })]);
});

test("the annotation list is served to editors with each place's name", async () => {
  const created = await createAnnotation(db(), annotationOn("node-1"));

  const annotationList = await (await app.request("/api/annotations", { headers: auth })).json();

  expect(annotationList).toEqual([{ ...created, placeName: "Café am Markt", placeSubtype: "cafe", placeGone: false }]);
});

test("a created annotation is stored trimmed", async () => {
  const response = await sendJson("POST", "/api/annotations", annotationOn("node-1", { title: "  Kaffee  " }));

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: expect.any(String), ...annotationOn("node-1", { title: "Kaffee" }) });
  expect(await listAnnotations(db())).toEqual([expect.objectContaining({ title: "Kaffee" })]);
});

test("a title and a text exactly at their limits are accepted", async () => {
  const response = await sendJson(
    "POST",
    "/api/annotations",
    annotationOn("node-1", {
      title: "T".repeat(maxAnnotationTitleCharacters),
      text: "x".repeat(maxAnnotationTextCharacters),
    }),
  );

  expect(response.status).toBe(201);
});

test("a title longer than its limit is rejected", async () => {
  const title = "T".repeat(maxAnnotationTitleCharacters + 1);

  const response = await sendJson("POST", "/api/annotations", annotationOn("node-1", { title }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Titel ist zu lang (max. 60 Zeichen)"] });
});

test("a text longer than its limit is rejected", async () => {
  const text = "x".repeat(maxAnnotationTextCharacters + 1);

  const response = await sendJson("POST", "/api/annotations", annotationOn("node-1", { text }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Text ist zu lang (max. 200 Zeichen)"] });
});

test("the limits count the trimmed text, not the padding around it", async () => {
  const response = await sendJson(
    "POST",
    "/api/annotations",
    annotationOn("node-1", { title: ` ${"T".repeat(maxAnnotationTitleCharacters)} ` }),
  );

  expect(response.status).toBe(201);
});

test("a blank title and text are both reported", async () => {
  const response = await sendJson("POST", "/api/annotations", annotationOn("node-1", { title: "  ", text: "" }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Titel fehlt", "Text fehlt"] });
});

test("an end date before the start date is rejected", async () => {
  const response = await sendJson(
    "POST",
    "/api/annotations",
    annotationOn("node-1", { validFrom: "2026-11-01", validTo: "2026-10-31" }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["„Gültig bis“ liegt vor „Gültig von“"] });
});

test("a date that does not exist on the calendar is rejected", async () => {
  const response = await sendJson("POST", "/api/annotations", annotationOn("node-1", { validTo: "2026-02-31" }));

  expect(response.status).toBe(400);
});

test("an unknown place is rejected", async () => {
  const response = await sendJson("POST", "/api/annotations", annotationOn("node-999"));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Ort nicht gefunden"] });
});

test("an annotation is updated in place", async () => {
  const created = await createAnnotation(db(), annotationOn("node-1"));

  const response = await sendJson("PUT", `/api/annotations/${created.id}`, annotationOn("node-1", { title: "Neu" }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ...created, title: "Neu" });
});

test("an update with invalid input is rejected", async () => {
  const created = await createAnnotation(db(), annotationOn("node-1"));

  const response = await sendJson("PUT", `/api/annotations/${created.id}`, annotationOn("node-1", { title: " " }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Titel fehlt"] });
});

test("an update that moves the annotation to an unknown place is rejected", async () => {
  const created = await createAnnotation(db(), annotationOn("node-1"));

  const response = await sendJson("PUT", `/api/annotations/${created.id}`, annotationOn("node-999"));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["Ort nicht gefunden"] });
});

test("updating and deleting an unknown or malformed id is a 404", async () => {
  for (const id of [unknownAnnotationId, "not-a-uuid"]) {
    const update = await sendJson("PUT", `/api/annotations/${id}`, annotationOn("node-1"));
    const deletion = await app.request(`/api/annotations/${id}`, { method: "DELETE", headers: auth });
    expect([update.status, deletion.status], id).toEqual([404, 404]);
  }
});

test("an annotation can be deleted once", async () => {
  const created = await createAnnotation(db(), annotationOn("node-1"));
  const deleteIt = () => app.request(`/api/annotations/${created.id}`, { method: "DELETE", headers: auth });

  expect((await deleteIt()).status).toBe(204);
  expect((await deleteIt()).status).toBe(404);
});

test("an editor-triggered import answers with the import result", async () => {
  const response = await app.request("/api/places/import", { method: "POST", headers: auth });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(importResult);
});

test("a failed import answers 502 and keeps the places", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  app = appImporting(() => Promise.reject(new Error("Overpass is down")));

  const response = await app.request("/api/places/import", { method: "POST", headers: auth });

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    errors: ["Aktualisierung fehlgeschlagen – bestehende Orte bleiben erhalten."],
  });
});

test("the UI is served to editors and unknown paths fall back to its entry page", async () => {
  const script = await app.request("/app.js", { headers: auth });
  const clientSideRoute = await app.request("/angebote/neu", { headers: auth });

  expect(await script.text()).toContain("console.info");
  expect(await clientSideRoute.text()).toContain("<title>Redaktion</title>");
});

test("the entry page is revalidated on every load so that a deploy reaches the editors at once", async () => {
  const entryPage = await app.request("/", { headers: auth });
  const clientSideRoute = await app.request("/angebote/neu", { headers: auth });

  expect(entryPage.headers.get("Cache-Control")).toBe("no-cache");
  expect(clientSideRoute.headers.get("Cache-Control")).toBe("no-cache");
});

test("other UI files are not marked as uncached", async () => {
  const script = await app.request("/app.js", { headers: auth });

  expect(script.headers.get("Cache-Control")).toBeNull();
});

test("an unknown API path is a JSON 404 rather than the entry page", async () => {
  const response = await app.request("/api/unbekannt", { headers: auth });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ errors: ["Nicht gefunden"] });
});
