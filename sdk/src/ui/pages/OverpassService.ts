import { log } from "@/src/shared/Logger";
import { GeoCoordinate, geoCoordsFromLatLongDegrees } from "@/src/shared/GeoLocation";
import { convert } from "html-to-text";
import { parseNumberOrNull } from "@/src/shared/JavascriptExtensions";

type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
};

type OverpassResponse = {
  elements: OverpassNode[];
};

type OverpassWayGeometryPoint = {
  lat: number;
  lon: number;
};

export type StreetGeometry = {
  centerLine: GeoCoordinate[];
  width: number;
};

export type OverpassRoad = {
  type: "way";
  id: number;
  geometry: OverpassWayGeometryPoint[];
  tags: {
    highway:
      | "motorway"
      | "trunk"
      | "primary"
      | "secondary"
      | "tertiary"
      | "residential"
      | "unclassified"
      | "service"
      | "track"
      | "path"
      | string;

    name?: string;
    service?: string;
    lit?: "yes" | "no" | string;
    surface?: string;

    width?: string; // in meters, as string
    lanes?: string; // number of lanes as string
    ["lanes:width"]?: string;
    ["cycleway:width"]?: string;
    ["footway:width"]?: string;
    ["sidewalk:left"]?: string;
    ["sidewalk:right"]?: string;

    path?: "sidewalk" | "crossing" | "traffic_island" | string;
    segregated?: string;
    sidewalk?: "both" | "left" | "right" | string;
    foot?: "designated" | string;
    footway?: string;
    cycleway?: "track" | "lane" | "opposite" | string;
    bicycle?: "designated" | string;

    [key: string]: string | undefined;
  };
};

export function inferDangerousWidth(road: OverpassRoad): number {
  const widths = estimateRoadWidth(road.tags);
  return widths.carriageway + widths.cycleways;
}

type WidthEstimates = {
  carriageway: number; // lanes × lane width
  sidewalks: number; // total sidewalk width
  cycleways: number; // total cycleway width
  total: number; // sum
};

/**
 * Estimate total width of a road from Overpass tags
 */
function estimateRoadWidth(tags: OverpassRoad["tags"]): WidthEstimates {
  let carriageway = parseMetres(tags.width ?? tags["est_width"]);
  if (carriageway === null) {
    let lanes = parseNumberOrNull(tags.lanes);
    if (lanes === null) lanes = defaultLanes(tags.highway);

    let laneWidth = parseMetres(tags["lanes:width"]);
    if (laneWidth === null) laneWidth = defaultLaneWidth(tags.highway);

    carriageway = lanes * laneWidth;
  }

  let sidewalks = 0;
  const swWidth = parseMetres(tags["sidewalk:width"]);
  const swLeft = parseMetres(tags["sidewalk:left"]);
  const swRight = parseMetres(tags["sidewalk:right"]);

  if (swWidth !== null) {
    sidewalks += swWidth;
  } else if (swLeft !== null || swRight !== null) {
    if (swLeft !== null) sidewalks += swLeft;
    if (swRight !== null) sidewalks += swRight;
  } else {
    if (tags.sidewalk === "both") sidewalks += 2 * 1.8;
    else if (tags.sidewalk === "left" || tags.sidewalk === "right") sidewalks += 1.8;
  }

  let cycleways = 0;
  const cwWidth = parseMetres(tags["cycleway:width"]);
  if (cwWidth !== null) {
    cycleways += cwWidth;
  } else if (tags.cycleway === "track" || tags.cycleway === "lane") {
    cycleways += 1.5;
  }
  const total = carriageway + sidewalks + cycleways;
  return { carriageway, sidewalks, cycleways, total };
}

/**
 * Default lane width by OSM highway type (German average)
 * Source: RASt 06 / general German standards
 */
function defaultLaneWidth(highway: string): number {
  switch (highway) {
    case "motorway":
      return 3.75;
    case "trunk":
      return 3.5;
    case "primary":
      return 3.25;
    case "secondary":
      return 3.0;
    case "tertiary":
      return 3.0;
    case "residential":
      return 2.75;
    case "unclassified":
      return 2.75;
    case "service":
      return 2.5;
    default:
      return 3.0;
  }
}

/**
 * Default number of lanes by highway type if not specified
 */
function defaultLanes(highway: string): number {
  switch (highway) {
    case "motorway":
      return 4;
    case "trunk":
      return 2;
    case "primary":
      return 2;
    case "secondary":
      return 2;
    case "tertiary":
      return 2;
    case "residential":
      return 1;
    case "unclassified":
      return 1;
    case "service":
      return 1;
    default:
      return 1;
  }
}

type OverpassRoadsResponse = {
  elements: OverpassRoad[];
};

export async function getIntersectionCoords(routingCoords: number[][]) {
  if (1 === 1) {
    throw "skipping intersection request to save rate limits";
  }

  log.info("OVERPASS | Querying for intersection coordinates");
  const query = buildIntersectionOverpassQuery(routingCoords);
  const intersectionResponse = await fetchOverpassWithRetry<OverpassResponse>(query);
  return intersectionResponse.elements.map(
    (element) => ({ longitudeDegrees: element.lon, latitudeDegrees: element.lat }) satisfies GeoCoordinate,
  );
}

function parseMetres(str: string | undefined | null): number | null {
  if (str === undefined || str === null) return null;
  const num = parseNumberOrNull(str);
  if (num === null) return null;
  return toMeters(num, parseUnit(str));
}

function toMeters(value: number, unit: "ft" | "m" | null): number {
  if (unit === "ft") return value * 0.3048;
  return value;
}

function parseUnit(str: string): "ft" | "m" | null {
  if (str.includes("M")) return "m";
  else if (str.includes("ft")) return "ft";
  else return null;
}

/**
 * Builds an Overpass QL query that finds intersection nodes along a given route.
 *
 * For each coordinate pair, the query:
 * - Selects the nearest OSM node at that location
 * - Collects all ways connected to that node
 * - Keeps only nodes that belong to more than one way (i.e. intersections)
 *
 * The result is a JSON response containing geometry for nodes that represent
 * intersections along the provided routing coordinates.
 *
 * @param routingCoords - Array of `[longitude, latitude]` coordinate pairs
 *                        representing a route.
 * @returns A string containing a valid Overpass QL query.
 */
function buildIntersectionOverpassQuery(routingCoords: number[][]) {
  const nodeList = routingCoords.map(([lon, lat]) => `node(around:20, ${lat}, ${lon});`).join("\n");
  return `
      [out:json][timeout:250];
      
      (
      ${nodeList}
      )->.allNodes; 

      way(bn.allNodes)["highway"]->.routeWays;
      node(way_cnt.routeWays:2-);
      out body;
      `;
}

const isTransientStatus = (status: number): boolean => {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
};

async function fetchOverpassWithRetry<T>(query: string): Promise<T> {
  const maxAttempts = 10;
  let attempts = 0;

  log.info(`OVERPASS | Sending Overpass query (length: ${query.length} chars)`);

  while (attempts < maxAttempts) {
    attempts++;

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "*/*",
        "User-Agent": "ARiadne/1.0",
      },
      body: new URLSearchParams({ data: query }).toString(),
    });

    if (response.ok) {
      log.info(`OVERPASS | request was successfull!`);
      return await response.json();
    }

    const status = response.status;
    const messageHtml = await response.text();
    const message = convert(messageHtml);
    const transient = isTransientStatus(status);

    log.error(`OVERPASS | attempt ${attempts} of ${maxAttempts} failed. Status: ${status}, message: ${message}`);

    const error = new Error(`HTTP ${status}: ${message}`);
    if (transient && attempts >= maxAttempts) {
      log.error("OVERPASS | no more retries.", error);
      throw error;
    }

    if (!transient) {
      log.error("OVERPASS | Not transient status error.", error);
      throw error;
    }

    await new Promise((res) => setTimeout(res, 1500));
  }

  throw new Error("Unexpected exit from retry loop");
}

/**
 * Fetches all road-like entities (ways with highway tag) within a given radius,
 * including their geometry and road width information.
 */
export async function getRoadsWithWidth(point: GeoCoordinate, radiusMetres: number): Promise<StreetGeometry[]> {
  log.info("OVERPASS | Querying for roads with width");
  const query = buildRoadsOverpassQuery({ lat: point.latitudeDegrees, lon: point.longitudeDegrees }, radiusMetres);
  const response = await fetchOverpassWithRetry<OverpassRoadsResponse>(query);
  return response.elements.map((road) => ({
    centerLine: road.geometry.map((point) => geoCoordsFromLatLongDegrees(point.lat, point.lon)),
    width: inferDangerousWidth(road),
  }));
}

/**
 * Builds an Overpass QL query that fetches all road-like entities within a bounding box.
 *
 * The query:
 * - Searches for all ways with a `highway` tag within the bounding box
 * - Returns full geometry and all tags for each way
 *
 * Road width information is available in the `width` tag when present in OSM data.
 * Some roads may also have `lanes` tag which can be used to estimate width.
 */
function buildRoadsOverpassQuery({ lat, lon }: OverpassWayGeometryPoint, radiusMetres: number): string {
  return `
    [out:json][timeout:25];
    (
      way(around:${radiusMetres}, ${lat}, ${lon})["highway"];
    );
    out geom tags;
  `;
}
