import { getRoute, Path } from "@/src/shared/Directions";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { consecutivePairs, sum } from "@/src/shared/JavascriptExtensions";
import { log } from "@/src/shared/Logger";
import { RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import { geoCoordinateToLocalPositionConverter } from "@/src/3d/coordinates";
import { projectPointToSegment, Segment } from "@/src/3d/math3d";

export type ExploreRoute = { path: Path; via: RankedPointOfInterest | null };

// Every candidate costs one GraphHopper request, so only the places the profile likes most are tried.
const viaCandidateCount = 3;

// Walking past a place on the other side of the street still shows it.
const routeCorridorMetres = 40;

const scorePenaltyPerExtraMinute = 0.1;
const secondsPerMinute = 60;

// Climbing is only a burden for walkers who are already slow; fast walkers shrug it off.
const slowWalkingSpeedMetresPerSecond = 1.0;
const scorePenaltyPerMetreClimbedBySlowWalker = 0.01;

/// Rates a route by the places it passes minus what it costs the user in extra time and climbing, compared with
/// the direct route.
export function routeScore(
  path: Path,
  pois: RankedPointOfInterest[],
  directPath: Path,
  walkingSpeedMetresPerSecond: number,
): number {
  const placesScore = sum(placesAlongPath(path, pois).map((poi) => poi.score));

  const extraMinutes = (path.distance - directPath.distance) / walkingSpeedMetresPerSecond / secondsPerMinute;
  const extraTimePenalty = scorePenaltyPerExtraMinute * extraMinutes;

  const climbingPenalty =
    walkingSpeedMetresPerSecond < slowWalkingSpeedMetresPerSecond
      ? scorePenaltyPerMetreClimbedBySlowWalker * path.ascend
      : 0;

  return placesScore - extraTimePenalty - climbingPenalty;
}

/// Chooses between the direct route and routes that detour through the best-ranked places.
/// A via route that cannot be fetched is simply not a candidate, so this never fails because of GraphHopper.
export async function proposeExploreRoute(
  start: GeoCoordinate,
  destination: GeoCoordinate,
  directPath: Path,
  pois: RankedPointOfInterest[],
  walkingSpeedMetresPerSecond: number,
): Promise<ExploreRoute> {
  const bestPlaces = [...pois].sort((a, b) => b.score - a.score).slice(0, viaCandidateCount);
  const viaRoutes = await Promise.all(bestPlaces.map((place) => requestRouteVia(start, destination, place)));

  const directRoute: ExploreRoute = { path: directPath, via: null };
  const candidates = [directRoute, ...viaRoutes.filter((route) => route !== null)];
  const scoredCandidates = candidates.map((route) => ({
    route,
    score: routeScore(route.path, pois, directPath, walkingSpeedMetresPerSecond),
  }));

  // On a tie the earlier candidate wins, so the direct route is kept unless a detour is clearly better.
  return scoredCandidates.reduce((best, candidate) => (candidate.score > best.score ? candidate : best)).route;
}

async function requestRouteVia(
  start: GeoCoordinate,
  destination: GeoCoordinate,
  via: RankedPointOfInterest,
): Promise<ExploreRoute | null> {
  try {
    const { paths } = await getRoute(start, destination, [via.location.coordinate]);
    const [path] = paths;
    return path ? { path, via } : null;
  } catch (error) {
    log.warn("Route via a ranked place failed, ignoring it", error);
    return null;
  }
}

function placesAlongPath(path: Path, pois: RankedPointOfInterest[]): RankedPointOfInterest[] {
  const [pathStart] = path.points.coordinates;
  if (!pathStart) return [];

  // The local frame is flat enough around the path for metre distances, unlike latitude/longitude degrees.
  const toLocalPosition = geoCoordinateToLocalPositionConverter(coordinateFromGeoJsonPosition(pathStart));
  const pathSegments: Segment[] = consecutivePairs(
    path.points.coordinates.map((position) => toLocalPosition(coordinateFromGeoJsonPosition(position))),
  );

  return pois.filter((poi) => {
    const poiPosition = toLocalPosition(poi.location.coordinate);
    return pathSegments.some(
      (segment) => projectPointToSegment(poiPosition, segment).distanceTo(poiPosition) <= routeCorridorMetres,
    );
  });
}

// GeoJSON positions are [longitude, latitude], the other way round from how people write coordinates.
function coordinateFromGeoJsonPosition([longitudeDegrees, latitudeDegrees]: [number, number]): GeoCoordinate {
  return geoCoordsFromLatLongDegrees(latitudeDegrees, longitudeDegrees);
}
