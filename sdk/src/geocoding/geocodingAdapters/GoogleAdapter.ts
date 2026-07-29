import {
  Address,
  AddressComponent,
  AutocompleteSuggestionsResponse,
  GeocodeResult,
  ParsedResponseData,
  PlaceDetailsResponseData,
} from "@/src/geocoding/GeocodingTypes";
import { LocationObjectCoords } from "expo-location";
import { getGoogleApiKey } from "@/src/shared/Env";
import { log } from "@/src/shared/Logger";
import { Geocoder } from "@/src/geocoding/TargetInterface";

export function createGoogleAdapter(): Geocoder {
  return {
    async geocode(text: string, userCoords: LocationObjectCoords): Promise<GeocodeResult[]> {
      const rawResponse = await fetchGoogleAutocompleteResponse(text, userCoords);

      async function fetchGoogleAutocompleteResponse(
        text: string,
        userCoords: LocationObjectCoords,
      ): Promise<AutocompleteSuggestionsResponse> {
        const autocompleteURL = `https://places.googleapis.com/v1/places:autocomplete?key=${getGoogleApiKey()}`;

        const body = {
          input: text,
          ...(userCoords && {
            locationBias: {
              circle: {
                center: {
                  latitude: userCoords.latitude,
                  longitude: userCoords.longitude,
                },
                radius: 1000,
              },
            },
          }),
        };

        const response = await fetch(autocompleteURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const message = await response.text();
          log.error(`HTTP ${response.status}: ${message}, requesting: ${autocompleteURL}`);
          throw new Error(`HTTP ${response.status}: ${message}`);
        }
        return await response.json();
      }

      function buildPlaceDetailsUrl(placeId: string) {
        const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
        url.searchParams.set("key", getGoogleApiKey());
        url.searchParams.set("fields", "addressComponents,location");
        return url.toString();
      }

      async function fetchGoogleCoordsAndPlaceData(placeId: string): Promise<PlaceDetailsResponseData> {
        const placeDetailsURL = buildPlaceDetailsUrl(placeId);

        const response = await fetch(placeDetailsURL, {
          headers: { "User-Agent": "@sw-code/ariadne-sdk" },
        });

        if (!response.ok) {
          const message = await response.text();
          log.error(`HTTP ${response.status}: ${message}, requesting: ${placeDetailsURL}`);
          throw new Error(`HTTP ${response.status}: ${message}`);
        }

        return await response.json();
      }

      async function getParsedResponseDataForId(placeId: string): Promise<ParsedResponseData | null> {
        const addressData: PlaceDetailsResponseData = await fetchGoogleCoordsAndPlaceData(placeId);
        const parsedAddressComponent: Address = parseGoogleAddressComponents(addressData.addressComponents);

        return {
          addressComponents: parsedAddressComponent,
          latitude: addressData.location.latitude,
          longitude: addressData.location.longitude,
        };
      }

      function parseGoogleAddressComponents(components: AddressComponent[]): Address {
        const get = (type: string): string => components.find((c) => c.types.includes(type))?.longText || "";

        return {
          street: get("route"),
          housenumber: get("street_number"),
          postcode: get("postal_code"),
          city: get("locality"),
        };
      }

      async function adaptGoogleGeocodeResponse(rawData: AutocompleteSuggestionsResponse): Promise<GeocodeResult[]> {
        const MAX_PLACE_DETAILS_REQUESTS = 5;
        const placesIDList: string[] = rawData.suggestions
          .map((suggestion) => suggestion.placePrediction.placeId)
          .slice(0, MAX_PLACE_DETAILS_REQUESTS);
        const results = await Promise.all(placesIDList.map((id) => getParsedResponseDataForId(id)));
        return results
          .filter((elemnt): elemnt is NonNullable<typeof elemnt> => elemnt !== null)
          .map((elemnt) => ({
            coordinates: {
              latitudeDegrees: elemnt.latitude,
              longitudeDegrees: elemnt.longitude,
            },
            city: elemnt.addressComponents.city,
            street: elemnt.addressComponents.street,
            housenumber: elemnt.addressComponents.housenumber,
            postcode: elemnt.addressComponents.postcode,
          }));
      }

      if (rawResponse && rawResponse.suggestions.length > 0) {
        return adaptGoogleGeocodeResponse(rawResponse);
      } else {
        return [];
      }
    },
  };
}
