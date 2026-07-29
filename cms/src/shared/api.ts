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

export type AnnotatedPoi = {
  id: PlaceId;
  category: string;
  subtype: string;
  name: string | null;
  latitude: number;
  longitude: number;
  annotations: (DateRange & { title: string; text: string })[];
};

export type ImportResult = { importedPlaceCount: number; newlyGonePlaceCount: number; goneMarkingSkipped: boolean };

export type ApiErrorBody = { errors: string[] };
