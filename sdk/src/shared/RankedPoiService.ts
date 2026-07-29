import { getCmsBaseUrl } from "@/src/shared/Env";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { getJsonOrThrow, jsonWithRoundedNumbers } from "@/src/shared/JavascriptExtensions";
import { OverpassPointOfInterestCategory, PointOfInterest } from "@/src/shared/poi";
import { CommonPointOfInterestSubtype, labelOfPointOfInterestSubtype } from "@/src/shared/poiSubtypes";
import type { InterestProfile } from "@/src/shared/UserProfileProvider";

// Mirrors `RankedPoi` in cms/src/shared/api.ts. The packages cannot share code
// because Metro does not resolve files outside of sdk/.
export type RankedPoiResponse = {
  id: string;
  category: OverpassPointOfInterestCategory;
  subtype: string;
  name: string | null;
  latitude: number;
  longitude: number;
  annotations: {
    title: string;
    text: string;
    validFrom: string | null;
    validTo: string | null;
  }[];
  score: number;
};

// Annotated places are the editors' picks and keep their own look; the others are there because the profile
// ranked them, so the map can tell the two apart.
export type RankedPointOfInterest = PointOfInterest & { score: number; isAnnotated: boolean };

// Mirrors `LatLong` and `RankingRequest` in cms/src/shared/api.ts.
type LatLong = { latitude: number; longitude: number };
type RankingRequest = { start: LatLong; destination: LatLong; profile?: InterestProfile };

// Three decimals are about 110 m. That is plenty for choosing places along a route, and the CMS does not learn
// where exactly someone starts. The counts in the profile are integers, so rounding the whole body only touches
// the coordinates. `destinationCandidateRadiusMetres` in cms/src/server/profile/ranking.ts assumes this rounding: it
// returns the places the app may match at the exact destination, and coarser rounding would move some beyond it.
const requestCoordinateFractionDigits = 3;

// The Viro panel has a fixed size and cannot scroll, so only as many annotations as fit into it are shown. The CMS
// serves them in the order the editors created them.
const maxAnnotationsShownInArPanel = 2;

const infoPosition: NonNullable<PointOfInterest["info"]>["position"] = [0, 1.6, 0];

type SubtypeLabels = Record<CommonPointOfInterestSubtype, string>;

// Unnamed places are labelled with their subtype, which therefore needs to be in the language of the user.
export async function fetchRankedPointsOfInterest(
  start: GeoCoordinate,
  destination: GeoCoordinate,
  profile: InterestProfile | null,
  subtypeLabels: SubtypeLabels,
): Promise<RankedPointOfInterest[]> {
  const request: RankingRequest = {
    start: toLatLong(start),
    destination: toLatLong(destination),
    ...(profile && { profile }),
  };
  const response = await fetch(`${getCmsBaseUrl()}/api/pois/ranked`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonWithRoundedNumbers(request, requestCoordinateFractionDigits),
  });
  const pois: RankedPoiResponse[] = await getJsonOrThrow(response);
  return pois.map((poi) => mapRankedPoiToPointOfInterest(poi, subtypeLabels));
}

function toLatLong({ latitudeDegrees, longitudeDegrees }: GeoCoordinate): LatLong {
  return { latitude: latitudeDegrees, longitude: longitudeDegrees };
}

export function mapRankedPoiToPointOfInterest(
  poi: RankedPoiResponse,
  subtypeLabels: SubtypeLabels,
): RankedPointOfInterest {
  return {
    id: poi.id,
    category: poi.category,
    subtype: poi.subtype,
    score: poi.score,
    isAnnotated: poi.annotations.length > 0,
    location: {
      coordinate: geoCoordsFromLatLongDegrees(poi.latitude, poi.longitude),
      headingDegrees: 0,
    },
    info: {
      name: poi.name ?? labelOfPointOfInterestSubtype(poi.subtype, subtypeLabels),
      description: poi.annotations
        .slice(0, maxAnnotationsShownInArPanel)
        .map(({ title, text }) => `${title}\n${text}`)
        .join("\n\n"),
      position: infoPosition,
    },
  };
}
