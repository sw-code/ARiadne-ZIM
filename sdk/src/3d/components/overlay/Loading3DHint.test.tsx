import React from "react";
import { render } from "@testing-library/react-native";
import "@testing-library/jest-native/extend-expect";
import { Loading3dHint } from "./Loading3dHint";

let mockDeviceLanguageCode = "en";
jest.mock("expo-localization", () => ({
  useLocales: () => [{ languageCode: mockDeviceLanguageCode }],
}));

describe("3d loading hint", () => {
  beforeEach(() => {
    mockDeviceLanguageCode = "en";
  });

  it("it renders a 'loading...' text", () => {
    const ui = render(<Loading3dHint stage="initializing" />);
    expect(ui.getByText("Loading...")).toBeTruthy();
  });

  it("it renders the text in German on a German device", () => {
    mockDeviceLanguageCode = "de";
    const ui = render(<Loading3dHint stage="initializing" />);
    expect(ui.getByText("Wird geladen...")).toBeTruthy();
  });

  it("it renders a nothing when done", () => {
    const ui = render(<Loading3dHint stage="running" />);
    expect(ui.toJSON()).toBeNull();
  });
});
