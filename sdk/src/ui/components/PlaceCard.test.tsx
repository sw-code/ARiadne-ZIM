import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { PlaceCard } from "./PlaceCard";
import { PointOfInterest } from "@/src/shared/poi";

const placeWithoutInfo: PointOfInterest = {
  id: "place-1",
  category: "amenity",
  subtype: "drinking_water",
  location: { coordinate: { latitudeDegrees: 51.5, longitudeDegrees: 7.4 }, headingDegrees: 0 },
};

const annotatedPlace: PointOfInterest = {
  ...placeWithoutInfo,
  info: { name: "Old Fountain", description: "History\nBuilt in 1887 for the market square.", position: [0, 0, 0] },
};

describe("PlaceCard", () => {
  it("shows the name and annotation text", () => {
    const ui = render(<PlaceCard poi={annotatedPlace} onNavigateHere={jest.fn()} onClose={jest.fn()} />);

    expect(ui.getByText("Old Fountain")).toBeTruthy();
    expect(ui.getByText("History\nBuilt in 1887 for the market square.")).toBeTruthy();
  });

  it("cuts the annotation text after four lines, like the AR panel", () => {
    const ui = render(<PlaceCard poi={annotatedPlace} onNavigateHere={jest.fn()} onClose={jest.fn()} />);

    expect(ui.getByText("History\nBuilt in 1887 for the market square.").props.numberOfLines).toBe(4);
  });

  it("falls back to the heading-cased subtype when the place has no info", () => {
    const ui = render(<PlaceCard poi={placeWithoutInfo} onNavigateHere={jest.fn()} onClose={jest.fn()} />);

    expect(ui.getByText("Drinking Water")).toBeTruthy();
  });

  it("Navigate here and Close call their handlers", () => {
    const onNavigateHere = jest.fn();
    const onClose = jest.fn();
    const ui = render(<PlaceCard poi={annotatedPlace} onNavigateHere={onNavigateHere} onClose={onClose} />);

    fireEvent.press(ui.getByText("Navigate here"));
    expect(onNavigateHere).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(ui.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigateHere).toHaveBeenCalledTimes(1);
  });

  it("Navigate here is disabled without a location", () => {
    const onNavigateHere = jest.fn();
    const onClose = jest.fn();
    const ui = render(
      <PlaceCard poi={annotatedPlace} canNavigateHere={false} onNavigateHere={onNavigateHere} onClose={onClose} />,
    );

    fireEvent.press(ui.getByText("Navigate here"));
    expect(onNavigateHere).not.toHaveBeenCalled();

    fireEvent.press(ui.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
