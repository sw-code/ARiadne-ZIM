import type { FeatureCollection } from "geojson";
import {
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { PlaceId, PlaceSummary } from "../shared/api.ts";

// MapLibre looks for its worker script next to its own module, which does not exist once Vite has bundled it.
setWorkerUrl(maplibreWorkerUrl);

const mapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";
const soestCentreLongitudeLatitude: [number, number] = [8.106, 51.5711];
const initialZoomLevel = 14;
const fitPaddingPixels = 48;
// Without a limit a single match would fill the screen with one building.
const maxFitZoomLevel = 17;
const placesSourceId = "places";
const placesLayerId = "places";

type PlaceMapProps = {
  places: PlaceSummary[];
  selectedPlaceId: PlaceId | null;
  // Set while the editor searches: matches may lie anywhere in the municipality, and can only be told apart on screen.
  shouldFitToPlaces: boolean;
  onSelect: (placeId: PlaceId) => void;
};

function toFeatureCollection(places: PlaceSummary[], selectedPlaceId: PlaceId | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
      properties: { id: place.id, selected: place.id === selectedPlaceId },
    })),
  };
}

export function PlaceMap({ places, selectedPlaceId, shouldFitToPlaces, onSelect }: PlaceMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Layers can only be added once the style has loaded, so the map is handed on to the other effects only then.
  const [loadedMap, setLoadedMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (containerRef.current === null) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleUrl,
      center: soestCentreLongitudeLatitude,
      zoom: initialZoomLevel,
    });
    map.on("load", () => {
      map.addSource(placesSourceId, { type: "geojson", data: toFeatureCollection([], null) });
      map.addLayer({
        id: placesLayerId,
        type: "circle",
        source: placesSourceId,
        // The selected place is drawn last, so that the places around it do not cover it.
        layout: { "circle-sort-key": ["case", ["get", "selected"], 1, 0] },
        paint: {
          "circle-radius": ["case", ["get", "selected"], 10, 6],
          "circle-color": ["case", ["get", "selected"], "#d97706", "#2563eb"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      setLoadedMap(map);
    });
    return () => map.remove();
  }, []);

  useEffect(() => {
    loadedMap?.getSource<GeoJSONSource>(placesSourceId)?.setData(toFeatureCollection(places, selectedPlaceId));
  }, [loadedMap, places, selectedPlaceId]);

  useEffect(() => {
    if (loadedMap === null) return;
    if (shouldFitToPlaces && places.length > 0) {
      const bounds = new LngLatBounds();
      places.forEach(({ longitude, latitude }) => bounds.extend([longitude, latitude]));
      loadedMap.fitBounds(bounds, { padding: fitPaddingPixels, maxZoom: maxFitZoomLevel });
    } else {
      loadedMap.easeTo({ center: soestCentreLongitudeLatitude, zoom: initialZoomLevel });
    }
  }, [loadedMap, places, shouldFitToPlaces]);

  useEffect(() => {
    if (loadedMap === null) return;
    const selectClickedPlace = ({ features }: MapLayerMouseEvent) => {
      const placeId = features?.[0]?.properties["id"];
      if (typeof placeId === "string") onSelect(placeId);
    };
    const showPointer = () => (loadedMap.getCanvas().style.cursor = "pointer");
    const hidePointer = () => (loadedMap.getCanvas().style.cursor = "");
    loadedMap.on("click", placesLayerId, selectClickedPlace);
    loadedMap.on("mouseenter", placesLayerId, showPointer);
    loadedMap.on("mouseleave", placesLayerId, hidePointer);
    return () => {
      loadedMap.off("click", placesLayerId, selectClickedPlace);
      loadedMap.off("mouseenter", placesLayerId, showPointer);
      loadedMap.off("mouseleave", placesLayerId, hidePointer);
    };
  }, [loadedMap, onSelect]);

  return <div ref={containerRef} className="place-map" />;
}
