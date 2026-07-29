import { GeoCoordinate } from "./GeoLocation";
import { getJsonOrThrow, createUrl } from "@/src/shared/JavascriptExtensions";
import { getGraphhopperApiKey } from "@/src/shared/Env";

export async function getRoute(
  start: GeoCoordinate,
  destination: GeoCoordinate,
  via: GeoCoordinate[] = [],
): Promise<Route> {
  const response = await fetch(buildDirectionsUrl(start, destination, via), {
    // TODO signal: abortController.current.signal,
    headers: { "User-Agent": "@sw-code/ariadne-sdk" },
  });

  return (await getJsonOrThrow(response)) as Route;
}

function buildDirectionsUrl(start: GeoCoordinate, destination: GeoCoordinate, via: GeoCoordinate[]) {
  return createUrl("https://graphhopper.com/api/1/route", {
    key: getGraphhopperApiKey(),
    // GraphHopper visits the points in the order given, so the via points must sit between start and destination.
    point: [start, ...via, destination].map(
      ({ latitudeDegrees, longitudeDegrees }) => `${latitudeDegrees},${longitudeDegrees}`,
    ),
    profile: "foot",
    locale: "en",
    elevation: "true",
    points_encoded: "false",
    heading_penalty: "0",
  });
}

export type Route = {
  paths: Path[];
  hints?: any;
  info?: any;
};

export type Path = {
  distance: number;
  weight: number;
  time: number;
  transfers: number;
  points_encoded: boolean;
  bbox: number[];
  points: {
    type: string;
    coordinates: [number, number][];
  };
  instructions: Instruction[];
  legs?: any;
  details: unknown;
  ascend: number;
  descend: number;
  snapped_waypoints?: any;
};

export type Instruction = {
  distance: number;
  heading?: number;
  last_heading?: number;
  sign?: any;
  interval: [number, number];
  text: string;
  time: number;
  street_name: string;
};
