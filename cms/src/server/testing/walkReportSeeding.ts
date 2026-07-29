import { sql } from "drizzle-orm";
import { chunked } from "../../shared/JavascriptExtensions.ts";
import type { Database } from "../database/connection.ts";
import { walkReports } from "../database/schema.ts";

// A statement binds 12 parameters per report and Postgres allows 65,535 per statement.
const reportsPerInsertStatement = 1_000;

// Inserts directly, bypassing the subtype filter, so that thousands of reports take milliseconds and need no places.
export async function seedWalkReports(
  db: Database,
  { count, installId, receivedDaysAgo }: { count: number; installId: string; receivedDaysAgo: number },
): Promise<void> {
  const report = {
    installId,
    consentVersion: 1,
    appVersion: "1.4.0",
    walkedOn: "2026-10-21",
    mode: "explore" as const,
    durationMinutes: 20,
    medianSpeedMetresPerSecond: 1.2,
    pauseCount: 0,
    arTrackingShare: 0.5,
    language: "de",
    counts: {},
    receivedOn: sql`current_date - ${receivedDaysAgo}::int`,
  };
  for (const batch of chunked(Array<typeof report>(count).fill(report), reportsPerInsertStatement)) {
    await db.insert(walkReports).values(batch);
  }
}
