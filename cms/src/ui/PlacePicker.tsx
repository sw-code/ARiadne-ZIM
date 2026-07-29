import { useMemo, useState } from "react";
import type { PlaceId, PlaceSummary } from "../shared/api.ts";
import { foldedForSearch } from "../shared/JavascriptExtensions.ts";
import { PlaceMap } from "./PlaceMap.tsx";
import { placeLabel } from "./placeLabel.ts";

// The whole municipality has about 1,700 places. Rendering all of them would make typing sluggish, and nobody scrolls
// through more than a screenful: they type more of the name instead.
const maxListedPlaceCount = 50;

// Editors often know a shop by its street rather than by its name.
const searchableTextsOf = (place: PlaceSummary): string[] => [placeLabel(place), place.address ?? ""];

type PlacePickerProps = {
  places: PlaceSummary[];
  selectedPlaceId: PlaceId | null;
  onSelect: (placeId: PlaceId) => void;
};

export function PlacePicker({ places, selectedPlaceId, onSelect }: PlacePickerProps) {
  const [query, setQuery] = useState("");
  const foldedQuery = foldedForSearch(query.trim());
  // The map reacts to a new list, so the list must only change when the places or the search do.
  const matchingPlaces = useMemo(
    () =>
      places.filter((place) => searchableTextsOf(place).some((text) => foldedForSearch(text).includes(foldedQuery))),
    [places, foldedQuery],
  );

  return (
    <div className="place-picker">
      <div>
        <h2>Ort wählen</h2>
        <input
          type="search"
          aria-label="Ort suchen"
          placeholder="Ort suchen…"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="place-list">
          {matchingPlaces.slice(0, maxListedPlaceCount).map((place) => (
            <li key={place.id}>
              <button type="button" aria-current={place.id === selectedPlaceId} onClick={() => onSelect(place.id)}>
                <span>{placeLabel(place)}</span>
                {place.address !== null && <small>{place.address}</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <PlaceMap
        places={matchingPlaces}
        selectedPlaceId={selectedPlaceId}
        shouldFitToPlaces={foldedQuery !== ""}
        onSelect={onSelect}
      />
    </div>
  );
}
