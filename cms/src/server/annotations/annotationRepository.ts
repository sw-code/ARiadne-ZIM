import { asc, eq, sql } from "drizzle-orm";
import type { Annotation, AnnotationInput, AnnotationListItem, IsoDate, PlaceId, Poi } from "../../shared/api.ts";
import { annotationStateOn } from "../../shared/annotationState.ts";
import { groupedBy } from "../../shared/JavascriptExtensions.ts";
import type { Database } from "../database/connection.ts";
import { annotations, places } from "../database/schema.ts";
import { categoryPreferringHealthcare } from "../places/placeRepository.ts";

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

// Every public ranking request reads every place, so the OSM tags, by far the largest column, are left out.
const poiColumnsOfPlaces = {
  id: places.id,
  category: categoryPreferringHealthcare,
  subtype: places.subtype,
  name: places.name,
  latitude: places.latitude,
  longitude: places.longitude,
  goneSince: places.goneSince,
};

// A place that has dropped out of OSM stays listed while it carries an active annotation: its offer is still valid
// for the people who see it.
export async function listPoisWithActiveAnnotations(db: Database, today: IsoDate): Promise<Poi[]> {
  const rows = await db
    .select({ place: poiColumnsOfPlaces, annotation: annotations })
    .from(places)
    .leftJoin(annotations, eq(annotations.placeId, places.id))
    .orderBy(asc(places.id), ...annotationOrder);
  // The rule for "active" lives in annotationStateOn only; SQL merely loads the candidates.
  return [...groupedBy(rows, ({ place }) => place.id).values()].flatMap((rowsOfPlace) => {
    const [{ place }] = rowsOfPlace;
    const activeAnnotations = rowsOfPlace
      .flatMap(({ annotation }) => (annotation === null ? [] : [annotation]))
      .filter((annotation) => annotationStateOn(annotation, today) === "active")
      .map(({ title, text, validFrom, validTo }) => ({ title, text, validFrom, validTo }));
    const isGone = place.goneSince !== null;
    if (isGone && activeAnnotations.length === 0) return [];
    return [
      {
        id: place.id,
        category: place.category,
        subtype: place.subtype,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        annotations: activeAnnotations,
      },
    ];
  });
}
