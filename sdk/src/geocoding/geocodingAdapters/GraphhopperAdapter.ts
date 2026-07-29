import { LocationObjectCoords } from "expo-location";
import { getGraphhopperApiKey } from "@/src/shared/Env";
import { GeocodeResult, GraphhopperHit, GraphhopperResponse } from "@/src/geocoding/GeocodingTypes";
import { log } from "@/src/shared/Logger";
import { Geocoder } from "@/src/geocoding/TargetInterface";
import { GeoCoordinate } from "@/src/shared/GeoLocation";

export function createGraphhopperAdapter(): Geocoder {
  return {
    async geocode(text: string, userCoords: LocationObjectCoords): Promise<GeocodeResult[]> {
      const rawResponse = await fetchGraphhopperRawData(text, userCoords);

      function createGraphhopperRequestURL(text: string, userCoords: LocationObjectCoords) {
        const baseUrl = "https://graphhopper.com/api/1/geocode";
        const apiKey = getGraphhopperApiKey();
        const url = new URL(baseUrl);
        url.searchParams.set("q", text);
        url.searchParams.set("locale", "de");
        url.searchParams.set("limit", "5");
        url.searchParams.set("key", apiKey);
        if (userCoords) {
          url.searchParams.set("point", `${userCoords.latitude},${userCoords.longitude}`);
        }
        return url;
      }

      async function fetchGraphhopperRawData(
        text: string,
        userCoords: LocationObjectCoords,
      ): Promise<GraphhopperResponse> {
        const graphhopperURL = createGraphhopperRequestURL(text, userCoords);
        const response = await fetch(graphhopperURL, {
          headers: { "User-Agent": "@sw-code/ariadne-sdk" },
        });

        if (!response.ok) {
          const message = await response.text();
          log.error(`HTTP ${response.status}: ${message}, requesting: ${graphhopperURL}`);
          throw new Error(`HTTP ${response.status}: ${message}`);
        }

        return await response.json();
      }

      function adaptGraphhopperResponse(rawData: GraphhopperResponse): GeocodeResult[] {
        const hits: GraphhopperHit[] = rawData.hits;
        return hits.map((hit) => {
          const { point, name, city, postcode, street, house_number } = hit;
          const coordinates: GeoCoordinate = { latitudeDegrees: point.lat, longitudeDegrees: point.lng };

          return {
            coordinates,
            city: city || name,
            postcode,
            street,
            housenumber: house_number,
          };
        });
      }

      if (rawResponse && rawResponse.hits?.length > 0) {
        return adaptGraphhopperResponse(rawResponse);
      } else {
        return [];
      }
    },
  };
}
