import { snakeCaseToHeadingCase } from "@/src/shared/JavascriptExtensions";

// OSM has no closed enumeration of tag values, so this is a curated set of the most common POI
// subtypes. The order is deliberate — it doubles as the default interest ranking: Settings lists the
// subtypes in this order until the user's own counts and choices reorder them, and the CMS mirrors the
// list as the assumption it ranks places by before the user's behaviour outweighs it. Commonly-visited
// leisure/food types lead; niche and professional services trail. Subtypes seen at runtime but missing
// here are listed after these as soon as the profile counts them (see UserProfileProvider).
export const commonPointOfInterestSubtypeList = [
  // food, drink & social
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "ice_cream",
  "biergarten",
  // leisure & outdoors
  "park",
  "garden",
  "playground",
  "dog_park",
  "nature_reserve",
  "viewpoint",
  "picnic_site",
  "marina",
  "swimming_pool",
  "sports_centre",
  "fitness_centre",
  "pitch",
  "stadium",
  // culture & entertainment
  "museum",
  "gallery",
  "artwork",
  "theatre",
  "cinema",
  "nightclub",
  "attraction",
  "theme_park",
  "zoo",
  // historic & sightseeing
  "monument",
  "memorial",
  "castle",
  "ruins",
  "archaeological_site",
  "monastery",
  "wayside_cross",
  "tomb",
  // groceries & everyday shops
  "supermarket",
  "bakery",
  "convenience",
  "marketplace",
  "greengrocer",
  "butcher",
  "kiosk",
  // retail
  "clothes",
  "shoes",
  "books",
  "gift",
  "florist",
  "jewelry",
  "beauty",
  "hairdresser",
  "optician",
  "electronics",
  "mobile_phone",
  "bicycle",
  "department_store",
  "hardware",
  "car_repair",
  // accommodation & travel
  "hotel",
  "hostel",
  "guest_house",
  "motel",
  "camp_site",
  "information",
  // transport & utilities
  "fuel",
  "charging_station",
  "parking",
  "bicycle_parking",
  // everyday services & civic
  "pharmacy",
  "bank",
  "atm",
  "post_office",
  "library",
  "drinking_water",
  "fountain",
  "toilets",
  "bench",
  "place_of_worship",
  // education & health facilities
  "school",
  "university",
  "kindergarten",
  "hospital",
  "doctors",
  // crafts & trades
  "brewery",
  "photographer",
  "carpenter",
  "electrician",
  "plumber",
  "painter",
  "shoemaker",
  "tailor",
  // professional & specialist services
  "company",
  "government",
  "estate_agent",
  "it",
  "accountant",
  "clinic",
  "physiotherapist",
  "psychotherapist",
  "alternative",
  "laboratory",
  "rehabilitation",
  "dentist",
  "coworking",
  "lawyer",
  "insurance",
] as const;

export type CommonPointOfInterestSubtype = (typeof commonPointOfInterestSubtypeList)[number];

function isCommonPointOfInterestSubtype(subtype: string): subtype is CommonPointOfInterestSubtype {
  return (commonPointOfInterestSubtypeList as readonly string[]).includes(subtype);
}

/// Subtypes outside the curated list come straight from OSM at runtime, so there is no translation for them.
export function labelOfPointOfInterestSubtype(
  subtype: string,
  labels: Record<CommonPointOfInterestSubtype, string>,
): string {
  return isCommonPointOfInterestSubtype(subtype) ? labels[subtype] : snakeCaseToHeadingCase(subtype);
}

const sensitiveCategory = "healthcare";

// Mirrors `isSensitive` and its lists in cms/src/server/profile/sensitiveSubtypes.ts. Health and religion
// are special categories of personal data (GDPR Art. 9): interest in these places reveals more about a
// person than the app may collect, so they are never counted, reported or profiled.
const sensitiveSubtypes: ReadonlySet<string> = new Set([
  "hospital",
  "clinic",
  "doctors",
  "dentist",
  "pharmacy",
  "physiotherapist",
  "psychotherapist",
  "rehabilitation",
  "alternative",
  "laboratory",
  "place_of_worship",
]);

export function isSensitiveSubtype(subtype: string): boolean {
  return sensitiveSubtypes.has(subtype);
}

export function isSensitive({ category, subtype }: { category: string; subtype: string }): boolean {
  return category === sensitiveCategory || isSensitiveSubtype(subtype);
}
