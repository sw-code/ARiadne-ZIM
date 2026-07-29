import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { WalkCounts, WalkReport } from "../../shared/api.ts";

export const places = pgTable("places", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  subtype: text("subtype").notNull(),
  name: text("name"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  tags: jsonb("tags").$type<Record<string, string>>().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  goneSince: timestamp("gone_since", { withTimezone: true }),
});

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id),
    title: text("title").notNull(),
    text: text("text").notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("annotations_valid_range", sql`${table.validTo} >= ${table.validFrom}`)],
);

export const walkReports = pgTable(
  "walk_reports",
  {
    // Random rather than a sequence: numbers in arrival order would tell the order of the reports within a day, which
    // the timestamps of the ingress log could turn back into times of day.
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    installId: uuid("install_id").notNull(),
    consentVersion: integer("consent_version").notNull(),
    appVersion: text("app_version").notNull(),
    walkedOn: date("walked_on", { mode: "string" }).notNull(),
    mode: text("mode").$type<WalkReport["mode"]>().notNull(),
    durationMinutes: doublePrecision("duration_minutes").notNull(),
    medianSpeedMetresPerSecond: doublePrecision("median_speed_metres_per_second"),
    pauseCount: integer("pause_count").notNull(),
    arTrackingShare: doublePrecision("ar_tracking_share").notNull(),
    language: text("language").notNull(),
    counts: jsonb("counts").$type<WalkCounts>().notNull(),
    // A day without a time of day: together with the walk's duration a time would tell when someone walked.
    receivedOn: date("received_on", { mode: "string" })
      .notNull()
      .default(sql`current_date`),
  },
  (table) => [
    index("walk_reports_install_id_index").on(table.installId),
    // Each public report counts the reports of its day against the daily cap; retention and learning select by day too.
    index("walk_reports_received_on_index").on(table.receivedOn),
  ],
);
