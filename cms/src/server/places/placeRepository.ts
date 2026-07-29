import { and, asc, isNull, lt, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { PlaceId, PlaceSummary } from "../../shared/api.ts";
import { chunked } from "../../shared/JavascriptExtensions.ts";
import type { Database } from "../database/connection.ts";
import { places } from "../database/schema.ts";

export type ImportedPlace = {
  id: PlaceId;
  category: string;
  subtype: string;
  name: string | null;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
};

// The value the row would have had if it had been inserted, for use in `on conflict do update`.
const valueFromInsert = (column: PgColumn) => sql`excluded.${sql.identifier(column.name)}`;

// A statement binds 8 parameters per place and Postgres allows 65,535 per statement, so a full import must be split.
const placesPerInsertStatement = 1_000;

export async function upsertPlaces(db: Database, importedPlaces: ImportedPlace[], seenAt: Date): Promise<void> {
  // One transaction, so a failing batch cannot leave a half-written import behind.
  await db.transaction(async (transaction) => {
    for (const batch of chunked(importedPlaces, placesPerInsertStatement)) {
      await transaction
        .insert(places)
        .values(batch.map((place) => ({ ...place, lastSeenAt: seenAt })))
        .onConflictDoUpdate({
          target: places.id,
          set: {
            category: valueFromInsert(places.category),
            subtype: valueFromInsert(places.subtype),
            name: valueFromInsert(places.name),
            latitude: valueFromInsert(places.latitude),
            longitude: valueFromInsert(places.longitude),
            tags: valueFromInsert(places.tags),
            lastSeenAt: valueFromInsert(places.lastSeenAt),
            goneSince: null,
          },
        });
    }
  });
}

export function countPresentPlaces(db: Database): Promise<number> {
  return db.$count(places, isNull(places.goneSince));
}

export async function markPlacesUnseenSinceAsGone(db: Database, seenAt: Date): Promise<number> {
  const newlyGonePlaces = await db
    .update(places)
    .set({ goneSince: seenAt })
    .where(and(lt(places.lastSeenAt, seenAt), isNull(places.goneSince)))
    .returning({ id: places.id });
  return newlyGonePlaces.length;
}

export async function listPlaces(db: Database): Promise<PlaceSummary[]> {
  // Postgres sorts nulls last in ascending order, which puts unnamed places after the named ones.
  const rows = await db.select().from(places).orderBy(asc(places.name), asc(places.id));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    subtype: row.subtype,
    latitude: row.latitude,
    longitude: row.longitude,
    address: addressOf(row.tags),
    gone: row.goneSince !== null,
  }));
}

function addressOf(tags: Record<string, string>): string | null {
  const street = tags["addr:street"];
  if (street === undefined) return null;
  return `${street} ${tags["addr:housenumber"] ?? ""}`.trim();
}
