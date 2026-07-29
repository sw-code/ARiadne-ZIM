import { desc, eq, lt, sql } from "drizzle-orm";
import type { WalkCounts, WalkReport } from "../../shared/api.ts";
import type { Database } from "../database/connection.ts";
import { places, walkReports } from "../database/schema.ts";
import { categoryPreferringHealthcare } from "../places/placeRepository.ts";
import { isSensitiveSubtype, sensitiveCategory } from "../profile/sensitiveSubtypes.ts";

type WalkReportRow = typeof walkReports.$inferSelect;

type SubtypesOfPlaces = { known: Set<string>; healthcare: Set<string> };

// One query serves both filters below. A place's subtype is the value of its OSM tag, so a node tagged
// healthcare=counselling, or office=therapist next to a healthcare tag, has the sensitive category and a subtype that
// is on no list. The places table knows which subtypes occur under that category.
async function subtypesOfPlaces(db: Database): Promise<SubtypesOfPlaces> {
  const rows = await db
    .selectDistinct({ category: categoryPreferringHealthcare, subtype: places.subtype })
    .from(places);
  return {
    known: new Set(rows.map(({ subtype }) => subtype)),
    healthcare: new Set(rows.filter(({ category }) => category === sensitiveCategory).map(({ subtype }) => subtype)),
  };
}

// The phone leaves sensitive subtypes out already. Stripping them here too keeps them out of the database if an
// outdated or modified client sends them. Subtypes that no place has are dropped as well: nothing can be learned
// about them, and since any string is accepted as a key, they would let a client inflate the vocabulary that the
// collaborative filtering pairs up (quadratic in its size) until the server runs out of memory.
async function withoutSensitiveAndUnknownSubtypes(db: Database, counts: WalkCounts): Promise<WalkCounts> {
  const { known, healthcare } = await subtypesOfPlaces(db);
  return Object.fromEntries(
    Object.entries(counts).filter(
      ([subtype]) => known.has(subtype) && !isSensitiveSubtype(subtype) && !healthcare.has(subtype),
    ),
  );
}

function toWalkReport(row: WalkReportRow): WalkReport {
  return {
    installId: row.installId,
    consentVersion: row.consentVersion,
    appVersion: row.appVersion,
    walkedOn: row.walkedOn,
    mode: row.mode,
    durationMinutes: row.durationMinutes,
    medianSpeedMetresPerSecond: row.medianSpeedMetresPerSecond,
    pauseCount: row.pauseCount,
    arTrackingShare: row.arTrackingShare,
    language: row.language,
    counts: row.counts,
  };
}

export async function insertWalkReport(db: Database, report: WalkReport): Promise<void> {
  await db
    .insert(walkReports)
    .values({ ...report, counts: await withoutSensitiveAndUnknownSubtypes(db, report.counts) });
}

export async function deleteWalkReportsOf(db: Database, installId: string): Promise<number> {
  const deleted = await db.delete(walkReports).where(eq(walkReports.installId, installId));
  return deleted.rowCount ?? 0;
}

// Days are counted in the database's calendar, the one that dated the reports on arrival.
export async function deleteWalkReportsOlderThan(db: Database, maxAgeDays: number): Promise<number> {
  const deleted = await db
    .delete(walkReports)
    .where(lt(walkReports.receivedOn, sql`current_date - ${maxAgeDays}::int`));
  return deleted.rowCount ?? 0;
}

export function countWalkReportsReceivedToday(db: Database): Promise<number> {
  return db.$count(walkReports, eq(walkReports.receivedOn, sql`current_date`));
}

// The daily rebuild holds every report it learns from in memory, within a pod of 256 Mi, and reports can be posted by
// anyone. The limit keeps the rebuild within that memory however many reports were stored, at the price of learning
// from the newest five days only once the daily cap is reached every day.
export const maxWalkReportsToLearnFrom = 5_000;

// The id breaks ties between reports of the same day, so that the same reports are read on every call.
export async function listWalkReportsToLearnFrom(db: Database): Promise<WalkReport[]> {
  const rows = await db
    .select()
    .from(walkReports)
    .orderBy(desc(walkReports.receivedOn), desc(walkReports.id))
    .limit(maxWalkReportsToLearnFrom);
  return rows.map(toWalkReport);
}
