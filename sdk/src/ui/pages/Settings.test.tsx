import React from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Settings } from "@/src/ui/pages/Settings";
import { UserProfileProvider } from "@/src/shared/UserProfileProvider";
import { useObjectDetectionSetting } from "@/src/3d/objectDetectionSetting";

type SettingsProps = React.ComponentProps<typeof Settings>;

// without initial metrics, the provider renders nothing until the native side has measured the screen
const screenMetrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderSettings = async () => {
  const navigation = { goBack: jest.fn() } as unknown as SettingsProps["navigation"];
  const route = { key: "Settings", name: "Settings" } as SettingsProps["route"];
  const rendered = render(
    <SafeAreaProvider initialMetrics={screenMetrics}>
      <UserProfileProvider>
        <Settings navigation={navigation} route={route} />
      </UserProfileProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return rendered;
};

describe("Settings", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test("the object detection switch applies to the next AR session", async () => {
    const settings = await renderSettings();
    const detectionSwitch = screen.getByRole("switch", { name: "Object detection" });

    fireEvent(detectionSwitch, "valueChange", false);
    settings.unmount();

    const { result } = renderHook(() => useObjectDetectionSetting());
    await act(async () => {});
    const [isObjectDetectionEnabled, , isLoaded] = result.current;
    expect(isLoaded).toBe(true);
    expect(isObjectDetectionEnabled).toBe(false);
  });
});
