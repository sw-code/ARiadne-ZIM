import React from "react";
import { ActivityIndicator } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import { Button } from "./Button";

describe("Button", () => {
  it("does not trigger onPress when state is disabled", () => {
    const onPressHandler = jest.fn();

    const ui = render(
      <Button
        variant="primary"
        state="disabled"
        title="explore route"
        onPress={onPressHandler}
        startIcon="map"
        endIcon="arrow-right"
      />,
    );

    fireEvent.press(ui.getByText("explore route"));

    expect(onPressHandler).not.toHaveBeenCalled();
  });

  it("calls onPress when state is default", () => {
    const onPressHandler = jest.fn();

    const ui = render(
      <Button
        variant="primary"
        state="default"
        title="explore route"
        onPress={onPressHandler}
        startIcon="map"
        endIcon="arrow-right"
      />,
    );

    fireEvent.press(ui.getByText("explore route"));

    expect(onPressHandler).toHaveBeenCalledTimes(1);
  });

  it("renders a loading indicator instead of the right icon when state is loading", () => {
    const ui = render(
      <Button
        variant="secondary"
        state="loading"
        title="explore route"
        onPress={jest.fn()}
        startIcon="map"
        endIcon="arrow-right"
      />,
    );

    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
