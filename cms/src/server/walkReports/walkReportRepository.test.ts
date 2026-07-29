import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import type { WalkReport } from "../../shared/api.ts";
import { walkReports } from "../database/schema.ts";
import { upsertPlaces, type ImportedPlace } from "../places/placeRepository.ts";
import { useTestDatabase } from "../testing/testDatabase.ts";
import { seedWalkReports } from "../testing/walkReportSeeding.ts";
import {
  deleteWalkReportsOf,
  deleteWalkReportsOlderThan,
  insertWalkReport,
  listWalkReportsToLearnFrom,
  maxWalkReportsToLearnFrom,
} from "./walkReportRepository.ts";

const db = useTestDatabase();

const firstInstall = "11111111-1111-4111-8111-111111111111";
const secondInstall = "22222222-2222-4222-8222-222222222222";

const placeOf = (id: string, category: string, subtype: string): ImportedPlace => ({
  id,
  category,
  subtype,
  name: null,
  latitude: 51.5711,
  longitude: 8.106,
  tags: { [category]: subtype },
});

const seedPlaces = (...placesToSeed: ImportedPlace[]) =>
  upsertPlaces(db(), placesToSeed, new Date("2026-10-01T00:00:00Z"));

// Counts are only stored for subtypes that a place has, and the reports below count cafés.
beforeEach(() => seedPlaces(placeOf("node-1", "amenity", "cafe")));

const walkReportOf = (installId: string, overrides: Partial<WalkReport> = {}): WalkReport => ({
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
  ...overrides,
});

async function receiveReportDaysAgo(installId: string, days: number): Promise<void> {
  await insertWalkReport(db(), walkReportOf(installId));
  await db()
    .update(walkReports)
    .set({ receivedOn: sql`current_date - ${days}::int` })
    .where(eq(walkReports.installId, installId));
}

test("a walk report is read back as it was inserted", async () => {
  const report = walkReportOf(firstInstall, { mode: "straight", medianSpeedMetresPerSecond: null });

  await insertWalkReport(db(), report);

  expect(await listWalkReportsToLearnFrom(db())).toEqual([report]);
});

test("sensitive subtypes are not stored, even when places of that subtype exist", async () => {
  await seedPlaces(placeOf("node-2", "amenity", "pharmacy"), placeOf("node-3", "amenity", "place_of_worship"));
  const counts = {
    cafe: { shown: 4, engaged: 1 },
    pharmacy: { shown: 3, engaged: 3 },
    place_of_worship: { shown: 1, engaged: 0 },
  };

  await insertWalkReport(db(), walkReportOf(firstInstall, { counts }));

  expect(await listWalkReportsToLearnFrom(db())).toEqual([
    expect.objectContaining({ counts: { cafe: { shown: 4, engaged: 1 } } }),
  ]);
});

test("subtypes of places in the healthcare category are not stored, whatever the subtype is called", async () => {
  await seedPlaces(placeOf("node-2", "healthcare", "counselling"));
  const counts = { cafe: { shown: 4, engaged: 1 }, counselling: { shown: 2, engaged: 2 } };

  await insertWalkReport(db(), walkReportOf(firstInstall, { counts }));

  expect(await listWalkReportsToLearnFrom(db())).toEqual([
    expect.objectContaining({ counts: { cafe: { shown: 4, engaged: 1 } } }),
  ]);
});

test("subtypes of places that also carry a healthcare tag are not stored", async () => {
  await seedPlaces({
    ...placeOf("node-2", "office", "therapist"),
    tags: { office: "therapist", healthcare: "psychotherapist" },
  });
  const counts = { cafe: { shown: 4, engaged: 1 }, therapist: { shown: 2, engaged: 2 } };

  await insertWalkReport(db(), walkReportOf(firstInstall, { counts }));

  expect(await listWalkReportsToLearnFrom(db())).toEqual([
    expect.objectContaining({ counts: { cafe: { shown: 4, engaged: 1 } } }),
  ]);
});

test("subtypes that no place has are not stored", async () => {
  const counts = { cafe: { shown: 4, engaged: 1 }, made_up_subtype: { shown: 5, engaged: 5 } };

  await insertWalkReport(db(), walkReportOf(firstInstall, { counts }));

  expect(await listWalkReportsToLearnFrom(db())).toEqual([
    expect.objectContaining({ counts: { cafe: { shown: 4, engaged: 1 } } }),
  ]);
});

test("the reports of one install are deleted and counted, those of others are kept", async () => {
  await insertWalkReport(db(), walkReportOf(firstInstall));
  await insertWalkReport(db(), walkReportOf(firstInstall, { walkedOn: "2026-10-22" }));
  await insertWalkReport(db(), walkReportOf(secondInstall));

  expect(await deleteWalkReportsOf(db(), firstInstall)).toBe(2);

  expect(await listWalkReportsToLearnFrom(db())).toEqual([expect.objectContaining({ installId: secondInstall })]);
});

test("deleting the reports of an install without any deletes nothing", async () => {
  expect(await deleteWalkReportsOf(db(), firstInstall)).toBe(0);
});

test("reports received more than 365 days ago are deleted", async () => {
  await receiveReportDaysAgo(firstInstall, 366);
  await receiveReportDaysAgo(secondInstall, 365);

  expect(await deleteWalkReportsOlderThan(db(), 365)).toBe(1);

  expect(await listWalkReportsToLearnFrom(db())).toEqual([expect.objectContaining({ installId: secondInstall })]);
});

// A time of day together with the walk's duration would tell when someone walked, and could be matched with the
// ingress log.
test("a report keeps the day it was received and no time of day", async () => {
  await insertWalkReport(db(), walkReportOf(firstInstall));

  const columns = await db().execute<{ data_type: string }>(
    sql`select data_type from information_schema.columns where table_name = 'walk_reports'`,
  );
  const [received] = await db()
    .select({ isToday: sql<boolean>`${walkReports.receivedOn} = current_date` })
    .from(walkReports);

  expect(columns.rows.map(({ data_type }) => data_type)).not.toContainEqual(expect.stringMatching(/^(timestamp|time)/));
  expect(received?.isToday).toBe(true);
});

test("learning reads only the newest reports, up to its limit", async () => {
  await seedWalkReports(db(), { count: 1, installId: firstInstall, receivedDaysAgo: 1 });
  await seedWalkReports(db(), { count: maxWalkReportsToLearnFrom, installId: secondInstall, receivedDaysAgo: 0 });

  const reports = await listWalkReportsToLearnFrom(db());

  expect(reports).toHaveLength(maxWalkReportsToLearnFrom);
  expect(reports.map(({ installId }) => installId)).not.toContain(firstInstall);
});

test("learning reads the newest reports first", async () => {
  await receiveReportDaysAgo(firstInstall, 2);
  await receiveReportDaysAgo(secondInstall, 1);

  const reports = await listWalkReportsToLearnFrom(db());

  expect(reports.map(({ installId }) => installId)).toEqual([secondInstall, firstInstall]);
});
