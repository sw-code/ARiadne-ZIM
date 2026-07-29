import { LocationObjectCoords } from "expo-location";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";

export interface Geocoder {
  geocode(text: string, userCoords: LocationObjectCoords | null): Promise<GeocodeResult[]>;
}
