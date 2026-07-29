import { getSuggestionTexts } from "./DestinationDropDownSelection";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";

describe("getSuggestionTexts", () => {
  it("builds primary as ‘Street Housenumber’ when both are present", () => {
    const item: GeocodeResult = {
      street: "Baker Street",
      housenumber: "221B",
      city: "London",
      postcode: "NW1",
      coordinates: { latitudeDegrees: 0, longitudeDegrees: 0 },
    };

    const { primaryText, secondaryText, hasStreet } = getSuggestionTexts(item);

    expect(hasStreet).toBe(true);
    expect(primaryText).toBe("Baker Street 221B");
    expect(secondaryText).toBe("London NW1");
  });

  it("falls back to city/postcode when street is missing", () => {
    const item: GeocodeResult = {
      street: "",
      housenumber: "",
      city: "Paris",
      postcode: "75001",
      coordinates: { latitudeDegrees: 0, longitudeDegrees: 0 },
    };

    const { primaryText, secondaryText, hasStreet } = getSuggestionTexts(item);

    expect(hasStreet).toBe(false);
    expect(primaryText).toBe("Paris 75001");
    expect(secondaryText).toBe("Paris 75001");
  });

  it("trims extra spaces and handles missing postcode", () => {
    const item: GeocodeResult = {
      street: "   Elm Avenue",
      housenumber: "42 ",
      city: "    ",
      postcode: "",
      coordinates: { latitudeDegrees: 0, longitudeDegrees: 0 },
    };

    const { primaryText, secondaryText } = getSuggestionTexts(item);

    expect(primaryText).toBe("Elm Avenue 42");
    expect(secondaryText).toBe("");
  });

  it("handles city only without postcode", () => {
    const item: GeocodeResult = {
      street: "",
      housenumber: "",
      city: "Berlin",
      postcode: "",
      coordinates: { latitudeDegrees: 0, longitudeDegrees: 0 },
    };

    const { primaryText, secondaryText, hasStreet } = getSuggestionTexts(item);

    expect(hasStreet).toBe(false);
    expect(primaryText).toBe("Berlin");
    expect(secondaryText).toBe("Berlin");
  });
});
