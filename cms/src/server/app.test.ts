import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { maxAnnotationTextCharacters, maxAnnotationTitleCharacters } from "../shared/annotationLimits.ts";
import type { AnnotationInput, ImportResult, WalkReport } from "../shared/api.ts";
import { createAnnotation, listAnnotations } from "./annotations/annotationRepository.ts";
import { createApp, type AppDependencies } from "./app.ts";
import { connectDatabase, type Database } from "./database/connection.ts";
import { walkReports } from "./database/schema.ts";
import { upsertPlaces } from "./places/placeRepository.ts";
import type { ImportedPlace } from "./places/placeRepository.ts";
import { curatedPriorModel } from "./profile/interest.ts";
import { testDatabaseUrl, useTestDatabase } from "./testing/testDatabase.ts";
import { seedWalkReports } from "./testing/walkReportSeeding.ts";
import { insertWalkReport, listWalkReportsToLearnFrom } from "./walkReports/walkReportRepository.ts";

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

const bar: ImportedPlace = {
  id: "node-2",
  category: "amenity",
  subtype: "bar",
  name: "Bar am Markt",
  latitude: 51.5711,
  longitude: 8.108,
  tags: { amenity: "bar" },
};

const pharmacy: ImportedPlace = {
  id: "node-3",
  category: "amenity",
  subtype: "pharmacy",
  name: "Apotheke am Markt",
  latitude: 51.5711,
  longitude: 8.11,
  tags: { amenity: "pharmacy" },
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
  return appWith({ importPlaces, now: () => now });
}

function appWith(overrides: Partial<AppDependencies>): Hono {
  return createApp({
    db: db(),
    editorPassword: "secret",
    importPlaces: async () => importResult,
    now: () => new Date("2026-10-21T10:00:00Z"),
    priorModel: () => curatedPriorModel,
    uiDistPath,
    ...overrides,
  });
}

// No table is on this connection's search path, so every query fails with Postgres' "undefined table" error (42P01).
// Drizzle puts the query's parameters, which hold a report's contents, into the message of such an error.
async function withDatabaseWithoutTables(run: (database: Database) => Promise<void>): Promise<void> {
  const url = new URL(testDatabaseUrl);
  url.searchParams.set("options", "-c search_path=pg_catalog");
  const connection = connectDatabase({ databaseUrl: url.toString(), caCertificatePath: null });
  try {
    await run(connection.db);
  } finally {
    await connection.close();
  }
}

function sendJson(method: "POST" | "PUT", path: string, body: object) {
  return app.request(path, { method, headers: jsonHeaders, body: JSON.stringify(body) });
}

// No credentials: the app calls this endpoint without them.
const rankingRequest = (body: object) =>
  app.request("/api/pois/ranked", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const installId = "11111111-1111-4111-8111-111111111111";
const otherInstallId = "22222222-2222-4222-8222-222222222222";
const walkReport: WalkReport = {
  installId,
  consentVersion: 1,
  appVersion: "1.4.0",
  walkedOn: "2026-10-21",
  mode: "explore",
  durationMinutes: 23.5,
  medianSpeedMetresPerSecond: 1.2,
  pauseCount: 2,
  arTrackingShare: 0.35,
  language: "de",
  counts: { cafe: { shown: 4, engaged: 1 } },
};

// No credentials: the app calls these endpoints without them.
const postWalkReport = (body: object) =>
  app.request("/api/walk-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const eraseWalkReportsOf = (id: string) => app.request(`/api/walk-reports/${id}`, { method: "DELETE" });
const countsOfSubtypes = (subtypeCount: number) =>
  Object.fromEntries(
    Array.from({ length: subtypeCount }, (_, index) => [`subtype_${index}`, { shown: 1, engaged: 0 }]),
  );

const nearCafe = {
  start: { latitude: 51.5711, longitude: 8.1 },
  destination: { latitude: 51.5711, longitude: 8.115 },
};
const idsOf = async (response: Response) => ((await response.json()) as { id: string }[]).map(({ id }) => id);

test("the health check is public", async () => {
  expect((await app.request("/healthz")).status).toBe(200);
});

test("the ranked feed is public", async () => {
  expect((await rankingRequest(nearCafe)).status).toBe(200);
});

test("an offer that ended on the 31st is gone after midnight in Soest although it is still the 31st in UTC", async () => {
  // 23:30 UTC on the 31st is already 00:30 on 1 November in Soest.
  app = appImporting(async () => importResult, new Date("2026-10-31T23:30:00Z"));
  await createAnnotation(db(), annotationOn("node-1", { title: "Endete am 31.10.", validTo: "2026-10-31" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "Endet am 1.11.", validTo: "2026-11-01" }));

  const feed = await (await rankingRequest(nearCafe)).json();

  expect(feed).toEqual([
    expect.objectContaining({ annotations: [expect.objectContaining({ title: "Endet am 1.11." })] }),
  ]);
});

test("installed apps from before the ranked feed still get the annotated places, without credentials", async () => {
  await upsertPlaces(db(), [bar], new Date("2026-10-01T00:00:00Z"));
  await createAnnotation(db(), annotationOn("node-1", { title: "Läuft", validFrom: "2026-10-21" }));
  await createAnnotation(db(), annotationOn("node-1", { title: "Abgelaufen", validTo: "2026-10-20" }));

  const response = await app.request("/api/annotated-pois");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    {
      id: "node-1",
      category: "amenity",
      subtype: "cafe",
      name: "Café am Markt",
      latitude: 51.5711,
      longitude: 8.106,
      annotations: [{ title: "Läuft", text: expect.any(String), validFrom: "2026-10-21", validTo: null }],
    },
  ]);
});

test("the profile reorders the ranked feed", async () => {
  await upsertPlaces(db(), [bar], new Date("2026-10-01T00:00:00Z"));
  const profile = { bar: { shown: 10, engaged: 10 } };

  expect(await idsOf(await rankingRequest(nearCafe))).toEqual(["node-1", "node-2"]);
  expect(await idsOf(await rankingRequest({ ...nearCafe, profile }))).toEqual(["node-2", "node-1"]);
});

test("a place that also carries a healthcare tag is not returned as a profiled place", async () => {
  const therapist: ImportedPlace = {
    ...cafe,
    id: "node-4",
    category: "office",
    subtype: "therapist",
    tags: { office: "therapist", healthcare: "psychotherapist" },
  };
  await upsertPlaces(db(), [therapist], new Date("2026-10-01T00:00:00Z"));
  const profile = { therapist: { shown: 10, engaged: 10 } };

  expect(await idsOf(await rankingRequest({ ...nearCafe, profile }))).toEqual(["node-1"]);
});

test("a profile with more engagements than showings is rejected", async () => {
  const profile = { cafe: { shown: 1, engaged: 2 } };

  const response = await rankingRequest({ ...nearCafe, profile });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ errors: ["engaged must not exceed shown"] });
});

test("a profile with a control character in a subtype is rejected", async () => {
  const profile = { "cafe\u0000": { shown: 1, engaged: 0 } };

  expect((await rankingRequest({ ...nearCafe, profile })).status).toBe(400);
});

test("a request body over 64 KiB is rejected", async () => {
  const response = await rankingRequest({ ...nearCafe, padding: "x".repeat(64 * 1024) });

  expect(response.status).toBe(413);
});

test("a walk report is stored without sensitive subtypes", async () => {
  await upsertPlaces(db(), [pharmacy], new Date("2026-10-01T00:00:00Z"));
  const counts = { cafe: { shown: 4, engaged: 1 }, pharmacy: { shown: 3, engaged: 3 } };

  const response = await postWalkReport({ ...walkReport, counts });

  expect(response.status).toBe(201);
  expect(await listWalkReportsToLearnFrom(db())).toEqual([
    { ...walkReport, counts: { cafe: { shown: 4, engaged: 1 } } },
  ]);
});

test("a walk report is stored without any field the app was not meant to send", async () => {
  await postWalkReport({ ...walkReport, latitude: 51.5711, longitude: 8.106 });

  expect(await listWalkReportsToLearnFrom(db())).toEqual([walkReport]);
});

test("an invalid walk report is rejected", async () => {
  const response = await postWalkReport({ ...walkReport, language: "de-DE" });

  expect(response.status).toBe(400);
  expect(await listWalkReportsToLearnFrom(db())).toEqual([]);
});

test.each([
  ["an install id that is no UUID", { installId: "not-a-uuid" }],
  ["a consent version of 0", { consentVersion: 0 }],
  ["a fractional consent version", { consentVersion: 1.5 }],
  ["a consent version that does not fit Postgres' integer", { consentVersion: 2 ** 31 }],
  ["an empty app version", { appVersion: "" }],
  ["an app version over 32 characters", { appVersion: "1".repeat(33) }],
  ["an app version with a NUL character", { appVersion: "1.4\u0000" }],
  ["a date that does not exist on the calendar", { walkedOn: "2026-02-31" }],
  ["a date before 2026", { walkedOn: "2025-12-31" }],
  ["the year 0", { walkedOn: "0000-01-01" }],
  ["a date after 2099", { walkedOn: "2100-01-01" }],
  ["an unknown mode", { mode: "wander" }],
  ["a negative duration", { durationMinutes: -1 }],
  ["a duration over a day", { durationMinutes: 1441 }],
  ["a speed over 10 m/s", { medianSpeedMetresPerSecond: 10.1 }],
  ["a negative speed", { medianSpeedMetresPerSecond: -0.1 }],
  ["a fractional pause count", { pauseCount: 1.5 }],
  ["more than 1000 pauses", { pauseCount: 1001 }],
  ["an AR share over 1", { arTrackingShare: 1.1 }],
  ["engagements that exceed the showings", { counts: { cafe: { shown: 1, engaged: 2 } } }],
  ["more than 500 subtypes", { counts: countsOfSubtypes(501) }],
  ["a subtype with a NUL character", { counts: { "cafe\u0000": { shown: 1, engaged: 0 } } }],
  ["a subtype with a line break", { counts: { "ca\nfe": { shown: 1, engaged: 0 } } }],
])("a walk report with %s is rejected", async (_description, overrides) => {
  expect((await postWalkReport({ ...walkReport, ...overrides })).status).toBe(400);
});

test("a walk report exactly at its limits is accepted", async () => {
  const report = {
    ...walkReport,
    consentVersion: 2 ** 31 - 1,
    appVersion: "1".repeat(32),
    durationMinutes: 1440,
    medianSpeedMetresPerSecond: 10,
    pauseCount: 1000,
    arTrackingShare: 1,
    counts: countsOfSubtypes(500),
  };

  expect((await postWalkReport(report)).status).toBe(201);
});

test.each(["2026-01-01", "2099-12-31"])("a walk on %s is accepted", async (walkedOn) => {
  expect((await postWalkReport({ ...walkReport, walkedOn })).status).toBe(201);
});

test("a walk report without a median speed is accepted", async () => {
  const report = { ...walkReport, medianSpeedMetresPerSecond: null };

  expect((await postWalkReport(report)).status).toBe(201);
  expect(await listWalkReportsToLearnFrom(db())).toEqual([report]);
});

test("a walk report body over 64 KiB is rejected", async () => {
  const response = await postWalkReport({ ...walkReport, padding: "x".repeat(64 * 1024) });

  expect(response.status).toBe(413);
});

test("the 1,001st walk report of a day is refused with a 429 and not stored", async () => {
  const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await seedWalkReports(db(), { count: 999, installId: otherInstallId, receivedDaysAgo: 0 });

  const thousandth = await postWalkReport(walkReport);
  const thousandAndFirst = await postWalkReport(walkReport);

  expect(thousandth.status).toBe(201);
  expect(thousandAndFirst.status).toBe(429);
  expect(await thousandAndFirst.json()).toEqual({ errors: ["Too many requests"] });
  expect(await db().$count(walkReports)).toBe(1_000);
  expect(consoleWarn.mock.calls).toEqual([["[POST /api/walk-reports] daily cap reached, report refused"]]);
});

test("walk reports of earlier days do not count against today's cap", async () => {
  await seedWalkReports(db(), { count: 1_000, installId: otherInstallId, receivedDaysAgo: 1 });

  expect((await postWalkReport(walkReport)).status).toBe(201);
});

test("deleting an install's reports is idempotent", async () => {
  await insertWalkReport(db(), walkReport);
  await insertWalkReport(db(), { ...walkReport, installId: otherInstallId });

  expect((await eraseWalkReportsOf(installId)).status).toBe(204);
  expect((await eraseWalkReportsOf(installId)).status).toBe(204);

  expect(await listWalkReportsToLearnFrom(db())).toEqual([expect.objectContaining({ installId: otherInstallId })]);
});

test("deleting the reports of a malformed install id is a 204 as well", async () => {
  expect((await eraseWalkReportsOf("not-a-uuid")).status).toBe(204);
});

test.each([
  ["POST /api/walk-reports", () => postWalkReport(walkReport)],
  ["DELETE /api/walk-reports/:installId", () => eraseWalkReportsOf(installId)],
  ["POST /api/pois/ranked", () => rankingRequest({ ...nearCafe, profile: { cafe: { shown: 3, engaged: 1 } } })],
])("a database failure on %s is logged without the request's contents", async (route, sendRequest) => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await withDatabaseWithoutTables(async (database) => {
    app = appWith({ db: database });
    const response = await sendRequest();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ errors: ["Internal server error"] });
  });

  expect(consoleError.mock.calls).toEqual([[`[${route}] request failed`, { postgresErrorCode: "42P01" }]]);
});

test("walk-report endpoints need no password", async () => {
  expect((await postWalkReport(walkReport)).status).toBe(201);
  expect((await eraseWalkReportsOf(installId)).status).toBe(204);
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
