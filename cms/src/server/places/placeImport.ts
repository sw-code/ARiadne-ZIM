import type { ImportResult } from "../../shared/api.ts";
import type { Database } from "../database/connection.ts";
import { countPresentPlaces, markPlacesUnseenSinceAsGone, upsertPlaces } from "./placeRepository.ts";
import type { ImportedPlace } from "./placeRepository.ts";

// A reply this much smaller than what we hold is treated as broken rather than as half the places having closed,
// whether or not Overpass flagged it.
export const minimumPlausibleImportShare = 0.5;

export function createPlaceImporter(
  db: Database,
  fetchPlaces: () => Promise<ImportedPlace[]>,
  now: () => Date,
): () => Promise<ImportResult> {
  let importInFlight: Promise<ImportResult> | null = null;

  // The startup import and an editor's manual refresh must not interleave: both would mark places gone.
  return () => {
    importInFlight ??= importPlaces(db, fetchPlaces, now).finally(() => {
      importInFlight = null;
    });
    return importInFlight;
  };
}

async function importPlaces(
  db: Database,
  fetchPlaces: () => Promise<ImportedPlace[]>,
  now: () => Date,
): Promise<ImportResult> {
  const fetchedPlaces = await fetchPlaces();
  const seenAt = now();
  // Counted before the upsert, which would otherwise make every fetched place count as present.
  const presentPlaceCount = await countPresentPlaces(db);
  await upsertPlaces(db, fetchedPlaces, seenAt);

  const importedPlaceCount = fetchedPlaces.length;
  const isPlausible = importedPlaceCount >= presentPlaceCount * minimumPlausibleImportShare;
  if (!isPlausible) return { importedPlaceCount, newlyGonePlaceCount: 0, goneMarkingSkipped: true };

  const newlyGonePlaceCount = await markPlacesUnseenSinceAsGone(db, seenAt);
  return { importedPlaceCount, newlyGonePlaceCount, goneMarkingSkipped: false };
}
