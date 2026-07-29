import { PointOfInterest } from "@/src/shared/poi";
import { RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import { distanceMetres, GeoCoordinate } from "@/src/shared/GeoLocation";
import { findMinimumBy } from "@/src/shared/JavascriptExtensions";

// Wide enough for a searched address to land on its place, too narrow to pick a neighbour. The CMS receives the
// destination rounded and returns the places within `destinationCandidateRadiusMetres` of it (cms/src/server/profile/
// ranking.ts), which covers this radius around the exact destination.
const destinationMatchRadiusMetres = 25;

// Mirrors `maxProfiledPoisPerResponse` in cms/src/server/profile/ranking.ts.
const maxProfiledPlacesDisplayed = 20;

type PressedFeature = { id?: string | number | undefined };

// The map layer's features carry the place's id as their feature id.
export function pressedPlace<Place extends PointOfInterest>(
  places: Place[],
  pressedFeatures: PressedFeature[],
): Place | undefined {
  for (const { id } of pressedFeatures) {
    const place = places.find((candidate) => candidate.id === id);
    if (place) return place;
  }
  return undefined;
}

// Pressing a marker again says nothing new about the interest, so one preview counts a place once. The caller keeps the
// set for as long as the preview lives.
export function engageOnce(
  engagedPlaceIds: Set<string>,
  place: PointOfInterest,
  recordEngaged: (place: PointOfInterest) => void,
): void {
  if (engagedPlaceIds.has(place.id)) return;
  engagedPlaceIds.add(place.id);
  recordEngaged(place);
}

// Searching an address or pressing "Navigate here" leads to a place without the user pressing its marker, so a
// destination at a place counts as navigating to it.
export function placeAtDestination<Place extends PointOfInterest>(
  places: Place[],
  destination: GeoCoordinate,
): Place | undefined {
  const distanceToDestinationMetres = (place: Place) => distanceMetres(place.location.coordinate, destination);
  const nearest = findMinimumBy(places, distanceToDestinationMetres);
  return nearest && distanceToDestinationMetres(nearest) <= destinationMatchRadiusMetres ? nearest : undefined;
}

// Besides the annotated places and the profile's picks, the CMS returns every place near the destination, only so that
// `placeAtDestination` finds the one the user navigates to. Near a destination there can be dozens of them. Displayed,
// they would take the AR's nearest slots even for types the user wants less of, count as shown or visited, and become
// candidates for the explore route. So apart from the matched place, they are dropped like any place outside the
// profile's best.
export function displayedPlaces<Place extends RankedPointOfInterest>(
  places: Place[],
  destination: GeoCoordinate,
): Place[] {
  const matchedPlace = placeAtDestination(places, destination);
  const bestProfiledPlaces = new Set(
    places
      .filter((place) => !place.isAnnotated)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxProfiledPlacesDisplayed),
  );
  return places.filter((place) => place.isAnnotated || bestProfiledPlaces.has(place) || place === matchedPlace);
}
