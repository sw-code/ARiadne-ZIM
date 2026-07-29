import { getCmsBaseUrl } from "@/src/shared/Env";
import { geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { getJsonOrThrow } from "@/src/shared/JavascriptExtensions";
import { OverpassPointOfInterestCategory, PointOfInterest } from "@/src/shared/poi";
import { CommonPointOfInterestSubtype, labelOfPointOfInterestSubtype } from "@/src/shared/poiSubtypes";

// Mirrors `AnnotatedPoi` in cms/src/shared/api.ts. The packages cannot share code
// because Metro does not resolve files outside of sdk/.
export type AnnotatedPoiResponse = {
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
};

// The Viro panel has a fixed size and cannot scroll, so only as many annotations as fit into it are shown. The CMS
// serves them in the order the editors created them.
const maxAnnotationsShownInArPanel = 2;

const infoPosition: NonNullable<PointOfInterest["info"]>["position"] = [0, 1.6, 0];

type SubtypeLabels = Record<CommonPointOfInterestSubtype, string>;

// Unnamed places are labelled with their subtype, which therefore needs to be in the language of the user.
export async function fetchAnnotatedPointsOfInterest(subtypeLabels: SubtypeLabels): Promise<PointOfInterest[]> {
  const response = await fetch(`${getCmsBaseUrl()}/api/annotated-pois`);
  const pois: AnnotatedPoiResponse[] = await getJsonOrThrow(response);
  return pois.map((poi) => mapAnnotatedPoiToPointOfInterest(poi, subtypeLabels));
}

export function mapAnnotatedPoiToPointOfInterest(
  poi: AnnotatedPoiResponse,
  subtypeLabels: SubtypeLabels,
): PointOfInterest {
  return {
    id: poi.id,
    category: poi.category,
    subtype: poi.subtype,
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
