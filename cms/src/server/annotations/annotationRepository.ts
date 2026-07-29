import { asc, eq, sql } from "drizzle-orm";
import type {
  AnnotatedPoi,
  Annotation,
  AnnotationInput,
  AnnotationListItem,
  IsoDate,
  PlaceId,
} from "../../shared/api.ts";
import { annotationStateOn } from "../../shared/annotationState.ts";
import { groupedBy } from "../../shared/JavascriptExtensions.ts";
import type { Database } from "../database/connection.ts";
import { annotations, places } from "../database/schema.ts";

type AnnotationRow = typeof annotations.$inferSelect;

// Postgres sorts nulls last in ascending order, but annotations without a start date have been running longest.
const annotationOrder = [sql`${annotations.validFrom} asc nulls first`, asc(annotations.title)];

function annotationsWithTheirPlaces(db: Database) {
  return db
    .select({ annotation: annotations, place: places })
    .from(annotations)
    .innerJoin(places, eq(annotations.placeId, places.id));
}

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    placeId: row.placeId,
    title: row.title,
    text: row.text,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

export async function listAnnotations(db: Database): Promise<AnnotationListItem[]> {
  const rows = await annotationsWithTheirPlaces(db).orderBy(...annotationOrder);
  return rows.map(({ annotation, place }) => ({
    ...toAnnotation(annotation),
    placeName: place.name,
    placeSubtype: place.subtype,
    placeGone: place.goneSince !== null,
  }));
}

export async function placeExists(db: Database, placeId: PlaceId): Promise<boolean> {
  return (await db.$count(places, eq(places.id, placeId))) > 0;
}

export async function createAnnotation(db: Database, input: AnnotationInput): Promise<Annotation> {
  const [created] = await db.insert(annotations).values(input).returning();
  if (created === undefined) throw new Error("Postgres returned no row for the inserted annotation");
  return toAnnotation(created);
}

export async function updateAnnotation(db: Database, id: string, input: AnnotationInput): Promise<Annotation | null> {
  const [updated] = await db
    .update(annotations)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(annotations.id, id))
    .returning();
  return updated === undefined ? null : toAnnotation(updated);
}

export async function deleteAnnotation(db: Database, id: string): Promise<boolean> {
  const deleted = await db.delete(annotations).where(eq(annotations.id, id)).returning({ id: annotations.id });
  return deleted.length > 0;
}

// A place that has dropped out of OSM stays in the feed: its offer is still valid for the people who see it.
export async function listAnnotatedPois(db: Database, today: IsoDate): Promise<AnnotatedPoi[]> {
  const rows = await annotationsWithTheirPlaces(db).orderBy(asc(places.id), ...annotationOrder);
  // The rule for "active" lives in annotationStateOn only; SQL merely loads the candidates.
  const activeRows = rows.filter(({ annotation }) => annotationStateOn(annotation, today) === "active");
  return [...groupedBy(activeRows, ({ place }) => place.id).values()].map((rowsOfPlace) => {
    const [{ place }] = rowsOfPlace;
    return {
      id: place.id,
      category: place.category,
      subtype: place.subtype,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      annotations: rowsOfPlace.map(({ annotation }) => ({
        title: annotation.title,
        text: annotation.text,
        validFrom: annotation.validFrom,
        validTo: annotation.validTo,
      })),
    };
  });
}
