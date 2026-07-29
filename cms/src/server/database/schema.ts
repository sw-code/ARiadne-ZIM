import { sql } from "drizzle-orm";
import { check, date, doublePrecision, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
