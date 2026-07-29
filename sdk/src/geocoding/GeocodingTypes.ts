import { GeoCoordinate } from "@/src/shared/GeoLocation";

export type GeocodeResult = {
  coordinates: GeoCoordinate;
  street: string;
  housenumber: string;
  city: string;
  postcode: string;
};
export type GraphhopperResponse = {
  hits: GraphhopperHit[];
};

export type GraphhopperHit = {
  point: { lat: number; lng: number };
  name: string;
  city: string;
  postcode: string;
  street: string;
  house_number: string;
};

export type PhotonFeature = {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    name: string;
    city: string;
    postcode: string;
    street: string;
    housenumber: string;
  };
};
export type PhotonResponse = {
  features: PhotonFeature[];
};

export type Suggestion = {
  placePrediction: {
    place: string;
    placeId: string;
    types: string[];
  };
};

export type AutocompleteSuggestionsResponse = {
  suggestions: Suggestion[];
};

export type AddressComponent = {
  longText: string;
  types: string[];
};

export type Address = {
  street: string;
  housenumber: string;
  postcode: string;
  city: string;
};

export type PlaceDetailsResponseData = {
  addressComponents: AddressComponent[];
  location: {
    latitude: number;
    longitude: number;
  };
};

export type ParsedResponseData = {
  addressComponents: Address;
  latitude: number;
  longitude: number;
};
