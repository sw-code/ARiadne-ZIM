import { snakeCaseToHeadingCase } from "@/src/shared/JavascriptExtensions";

// OSM has no closed enumeration of tag values, so this is a curated set of the most common POI
// subtypes. The order is deliberate — it doubles as the default interest ranking: the profile
// seeds both the sort priority and the shown dwell time from each subtype's position here, so the
// initial Settings order is fully predictable. At the moment that profile is only shown in
// Settings; it is not used to select which places the map and AR show. Commonly-visited leisure/food
// types lead; niche and professional services trail. Subtypes seen at runtime but missing here are
// added to the profile on first sight (see UserProfileProvider).
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
