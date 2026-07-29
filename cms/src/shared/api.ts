export type IsoDate = string; // "YYYY-MM-DD"
export type PlaceId = string; // "node-<osmId>"

export type DateRange = { validFrom: IsoDate | null; validTo: IsoDate | null };

export type AnnotationInput = DateRange & { placeId: PlaceId; title: string; text: string };
export type Annotation = AnnotationInput & { id: string };
export type AnnotationListItem = Annotation & { placeName: string | null; placeSubtype: string; placeGone: boolean };

export type PlaceSummary = {
  id: PlaceId;
  name: string | null;
  category: string;
  subtype: string;
  latitude: number;
  longitude: number;
  address: string | null;
  gone: boolean;
};

export type LatLong = { latitude: number; longitude: number };

export type PoiAnnotation = DateRange & { title: string; text: string };
export type Poi = LatLong & {
  id: PlaceId;
  category: string;
  subtype: string;
  name: string | null;
  annotations: PoiAnnotation[];
};
export type RankedPoi = Poi & { score: number };

export type ImportResult = { importedPlaceCount: number; newlyGonePlaceCount: number; goneMarkingSkipped: boolean };

export type InterestChoice = "more" | "less";
export type SubtypeCounts = { shown: number; engaged: number; choice?: InterestChoice };
export type InterestProfile = Record<string, SubtypeCounts>; // keyed by place subtype

export type RankingRequest = { start: LatLong; destination: LatLong; profile?: InterestProfile };

export type WalkCounts = Record<string, { shown: number; engaged: number }>; // keyed by place subtype
export type WalkReport = {
  installId: string;
  consentVersion: number;
  appVersion: string;
  walkedOn: IsoDate;
  mode: "explore" | "straight";
  durationMinutes: number;
  medianSpeedMetresPerSecond: number | null;
  pauseCount: number;
  // Share of the walk during which AR tracked, i.e. the phone was held up.
  arTrackingShare: number;
  language: string;
  counts: WalkCounts;
};

export type ApiErrorBody = { errors: string[] };
