import { log } from "@/src/shared/Logger";

import React, { createContext, useContext } from "react";
import { Geocoder } from "@/src/geocoding/TargetInterface";

export const GeocoderContext = createContext<Geocoder | null>(null);
export const GeocoderProvider: React.FC<{ geocoder: Geocoder; children: React.ReactNode }> = ({
  geocoder,
  children,
}) => <GeocoderContext.Provider value={geocoder}>{children}</GeocoderContext.Provider>;

export function useGeocoder(): Geocoder {
  const ctx = useContext(GeocoderContext);
  if (!ctx) {
    log.error("No Geocoder provided. Wrap your app in <GeocoderProvider>.");
    throw new Error("No Geocoder provided. Wrap your app in <GeocoderProvider>.");
  }
  return ctx;
}
