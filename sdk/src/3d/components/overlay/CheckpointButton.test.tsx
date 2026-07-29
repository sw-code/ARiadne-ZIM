import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CheckpointButton } from "./CheckpointButton";
import { ArOverlay } from "./Overlay";
import { log } from "@/src/shared/Logger";

// without initial metrics, the provider renders nothing until the native side has measured the screen
const screenMetrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe("checkpoint button", () => {
  it("numbers the taps from 1", () => {
    const logInfo = jest.spyOn(log, "info").mockImplementation(() => true);
    render(<CheckpointButton />);

    fireEvent.press(screen.getByText("Checkpoint 1"));

    expect(logInfo).toHaveBeenCalledWith(expect.stringMatching(/^POSITIONING \| Checkpoint .*"checkpointNumber":1/));
    expect(screen.getByText("Checkpoint 2")).toBeTruthy();
    logInfo.mockRestore();
  });

  it("is not shown in normal release builds", () => {
    render(
      <SafeAreaProvider initialMetrics={screenMetrics}>
        <ArOverlay
          overlayStage="running"
          stats={{
            geoTracking: null,
            geoAccuracyRadiusMeters: null,
            compassAccuracyDegrees: null,
            vpsUnavailableReason: null,
            framerate: 0,
          }}
          onBack={() => {}}
          sceneVision={null}
          danger={null}
          detectedObjects={[]}
        />
      </SafeAreaProvider>,
    );

    expect(screen.queryByText(/^Checkpoint/)).toBeNull();
  });
});
