import type { ImportedPlace } from "./placeRepository.ts";

// Copied in order from `pointOfInterestCategoryKeys` in sdk/src/shared/poi.ts. The order is the tie-break when a node
// carries several of these keys, and the app and the CMS must pick the same category for the same node.
export const placeCategoryKeys = [
  "amenity",
  "tourism",
  "shop",
  "leisure",
  "historic",
  "craft",
  "office",
  "healthcare",
] as const;

export type OverpassResponse = {
  // Present when the run failed after Overpass had already answered with HTTP 200, e.g. "runtime error: Query timed out".
  remark?: string;
  elements: { type: "node"; id: number; lat: number; lon: number; tags?: Record<string, string> }[];
};

type OverpassNode = OverpassResponse["elements"][number];

// The municipality is selected by its official key rather than by name: the district (Kreis Soest) is also named Soest.
const soestMunicipalityKey = "05974040";

// 35 to 40 s were observed against the live Overpass API, so 90 s leaves margin.
const overpassQueryTimeoutSeconds = 90;

// A little above the server's own timeout, so the server's reply is awaited, but a hung connection still rejects
// instead of holding the shared import for minutes.
const overpassRequestTimeoutSeconds = 100;

export const soestPlacesOverpassQuery = `[out:json][timeout:${overpassQueryTimeoutSeconds}];
area["boundary"="administrative"]["de:amtlicher_gemeindeschluessel"="${soestMunicipalityKey}"]->.soest;
(
${placeCategoryKeys.map((categoryKey) => `  node(area.soest)["${categoryKey}"];`).join("\n")}
);
out body;`;

export function mapOverpassResponseToPlaces(response: OverpassResponse): ImportedPlace[] {
  return response.elements.flatMap(mapNodeToPlaces);
}

function mapNodeToPlaces(node: OverpassNode): ImportedPlace[] {
  const tags = node.tags ?? {};
  const category = inferCategory(tags);
  if (category === null) return [];

  return [
    {
      id: `node-${node.id}`,
      category: category.key,
      subtype: category.value,
      name: tags["name"] ?? null,
      latitude: node.lat,
      longitude: node.lon,
      tags,
    },
  ];
}

function inferCategory(tags: Record<string, string>): { key: string; value: string } | null {
  for (const key of placeCategoryKeys) {
    const value = tags[key];
    if (value !== undefined) return { key, value };
  }
  return null;
}

export async function fetchSoestPlaces(overpassUrl: string): Promise<ImportedPlace[]> {
  const response = await fetch(overpassUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ARiadne-CMS/1.0" },
    body: new URLSearchParams({ data: soestPlacesOverpassQuery }).toString(),
    signal: AbortSignal.timeout(overpassRequestTimeoutSeconds * 1_000),
  });
  if (!response.ok) throw new Error(`Overpass answered with HTTP ${response.status}`);

  const overpassResponse = (await response.json()) as OverpassResponse;
  // A failed run still carries the elements found so far. Imported as it is, such a truncated list could hold enough
  // places to pass the plausibility check and mark all the others as gone.
  const { remark } = overpassResponse;
  if (remark !== undefined) throw new Error(`Overpass reported a failed run: ${remark}`);

  return mapOverpassResponseToPlaces(overpassResponse);
}
