import { LocationObjectCoords } from "expo-location";
import { GeocodeResult, PhotonFeature, PhotonResponse } from "@/src/geocoding/GeocodingTypes";
import { log } from "@/src/shared/Logger";
import { Geocoder } from "@/src/geocoding/TargetInterface";
import { GeoCoordinate } from "@/src/shared/GeoLocation";

export function createPhotonAdapter(): Geocoder {
  return {
    async geocode(text: string, userCoords: LocationObjectCoords): Promise<GeocodeResult[]> {
      const rawResponse = await fetchPhotonRawData(text, userCoords);

      function createPhotonRequestURL(text: string, userCoords: LocationObjectCoords) {
        const baseUrl = "https://photon.komoot.io/api/";
        const url = new URL(baseUrl);
        url.searchParams.set("q", text);
        url.searchParams.set("lang", "de");
        url.searchParams.set("limit", "5");
        if (userCoords) {
          url.searchParams.set("lat", userCoords.latitude.toString());
          url.searchParams.set("lon", userCoords.longitude.toString());
        }
        return url;
      }

      async function fetchPhotonRawData(text: string, userCoords: LocationObjectCoords): Promise<PhotonResponse> {
        const photonURL = createPhotonRequestURL(text, userCoords);
        const response = await fetch(photonURL, {
          headers: { "User-Agent": "@sw-code/ariadne-sdk" },
        });
        if (!response.ok) {
          const message = await response.text();
          log.error(`HTTP ${response.status}: ${message}, requesting: ${photonURL}`);
          throw new Error(`HTTP ${response.status}: ${message}`);
        }
        return await response.json();
      }

      function adaptPhotonResponse(rawData: PhotonResponse): GeocodeResult[] {
        const data: PhotonFeature[] = rawData.features;
        return data.map((hit) => {
          const coordinates: GeoCoordinate = {
            latitudeDegrees: hit.geometry.coordinates[1],
            longitudeDegrees: hit.geometry.coordinates[0],
          };
          const { name, city, postcode, street, housenumber } = hit.properties;

          return {
            coordinates,
            city: city || name,
            postcode,
            street,
            housenumber,
          };
        });
      }

      if (rawResponse && rawResponse.features.length > 0) {
        return adaptPhotonResponse(rawResponse);
      } else {
        return [];
      }
    },
  };
}
