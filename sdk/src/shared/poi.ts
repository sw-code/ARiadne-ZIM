import { ImageSourcePropType } from "react-native";
import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { Viro3DPoint } from "@reactvision/react-viro/dist/components/Types/ViroUtils";

// The OSM tag keys we treat as top-level POI categories. Their order is also the
// tie-breaking order used when a node carries several of these keys at once.
export const pointOfInterestCategoryKeys = [
  "amenity",
  "tourism",
  "shop",
  "leisure",
  "historic",
  "craft",
  "office",
  "healthcare",
] as const;

export type OverpassPointOfInterestCategory = (typeof pointOfInterestCategoryKeys)[number];

export type PointOfInterest = {
  id: string;
  category: OverpassPointOfInterestCategory;
  subtype: string; // the OSM tag value, e.g. "cafe" — the key the user profile prioritises on
  modelPath?: ImageSourcePropType;
  location: {
    coordinate: GeoCoordinate;
    headingDegrees: number;
  };
  info?: {
    name: string;
    description: string;
    position: Viro3DPoint;
  };
};

/// The place a route leads through stays in the list even while it is not among the nearest, so the user can see
/// where the detour goes.
export function withPinnedPointOfInterest(
  nearest: PointOfInterest[],
  pinned: PointOfInterest | null,
): PointOfInterest[] {
  if (pinned === null || nearest.some((poi) => poi.id === pinned.id)) return nearest;
  return [...nearest, pinned];
}
