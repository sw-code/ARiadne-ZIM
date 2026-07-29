import { useCallback, useState } from "react";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";
import { LocationObjectCoords } from "expo-location";
import { log } from "@/src/shared/Logger";

import { useGeocoder } from "@/src/geocoding/GeocodingProvider";

const MIN_QUERY_LENGTH = 2;

export function useGeoCoding(userCoordinates: LocationObjectCoords | null) {
  const [hasGeocodingStatusError, setHasGeocodingStatusError] = useState(false);
  const [geocodingResults, setGeocodingResults] = useState<GeocodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGeocodingResult, setHasGeocodingResult] = useState(false);

  const geocoder = useGeocoder();

  const clearGeocodingResults = useCallback(() => {
    setGeocodingResults([]);
    setHasGeocodingResult(false);
  }, []);

  const geocode = useCallback(
    async (query: string, userCoords: LocationObjectCoords | null) => {
      const results = await geocoder.geocode(query, userCoords);

      if (results && results.length > 0) {
        setGeocodingResults(results);
        setHasGeocodingResult(true);
      } else {
        log.error("Geocoding: No results found for query:", query);
        setHasGeocodingResult(false);
        setGeocodingResults([]);
      }
    },
    [geocoder],
  );

  const geocodeAddressToCoordinate = useCallback(
    async (query: string) => {
      if (query.length < MIN_QUERY_LENGTH) return;
      log.info(`Geocoding: Querying for locations by name '${query}'`);

      setIsLoading(true);
      setHasGeocodingResult(false);
      setHasGeocodingStatusError(false);
      try {
        await geocode(query, userCoordinates);
      } catch (error) {
        setHasGeocodingStatusError(true);
        log.error("Geocoding failed: ", error);
      } finally {
        setIsLoading(false);
      }
    },
    [geocode, userCoordinates],
  );

  return {
    geocodingResults,
    isLoading,
    hasGeocodingStatusError,
    geocodeAddressToCoordinate,
    clearGeocodingResults,
    hasGeocodingResult,
  };
}
