import React from "react";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Settings } from "@/src/ui/pages/Settings";
import { COUNTS_STORAGE_KEY, UserProfileProvider } from "@/src/shared/UserProfileProvider";
import { useObjectDetectionSetting } from "@/src/3d/objectDetectionSetting";

type SettingsProps = React.ComponentProps<typeof Settings>;

// without initial metrics, the provider renders nothing until the native side has measured the screen
const screenMetrics = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

type ProviderOptions = { offersWalkReportSharing?: boolean };

const renderSettingsWithoutWaiting = (options: ProviderOptions = {}) => {
  const navigation = { goBack: jest.fn() } as unknown as SettingsProps["navigation"];
  const route = { key: "Settings", name: "Settings" } as SettingsProps["route"];
  return render(
    <SafeAreaProvider initialMetrics={screenMetrics}>
      <UserProfileProvider {...options}>
        <Settings navigation={navigation} route={route} />
      </UserProfileProvider>
    </SafeAreaProvider>,
  );
};

// Awaiting lets the stored settings and counts load inside act(), so the screen shows its final state.
const renderSettings = async (options: ProviderOptions = {}) => {
  const rendered = renderSettingsWithoutWaiting(options);
  await act(async () => {});
  return rendered;
};

const offeringSharing: ProviderOptions = { offersWalkReportSharing: true };

const rowOf = (subtype: string) => within(screen.getByTestId(`interest-row-${subtype}`));

const firstRowTestId = () => screen.getAllByTestId(/^interest-row-/)[0]!.props.testID;

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

  test("choosing More moves a type to the top", async () => {
    await renderSettings();
    expect(firstRowTestId()).not.toBe("interest-row-bakery");

    fireEvent.press(rowOf("bakery").getByText("More"));

    expect(firstRowTestId()).toBe("interest-row-bakery");
  });

  test("choosing Auto takes the override back", async () => {
    await renderSettings();
    const originalFirstRowTestId = firstRowTestId();

    fireEvent.press(rowOf("bakery").getByText("More"));
    fireEvent.press(rowOf("bakery").getByText("Auto"));

    expect(firstRowTestId()).toBe(originalFirstRowTestId);
  });

  test("rows show how often a type was seen and looked at", async () => {
    await AsyncStorage.setItem(COUNTS_STORAGE_KEY, JSON.stringify({ cafe: { shown: 1, engaged: 1 } }));

    await renderSettings();

    expect(rowOf("cafe").getByText("Seen 1 · looked at 1")).toBeTruthy();
    expect(rowOf("restaurant").getByText("Seen 0 · looked at 0")).toBeTruthy();
  });

  test("the personalisation and sharing switches persist", async () => {
    const settings = await renderSettings(offeringSharing);
    expect(screen.getByRole("switch", { name: "Personalised places" }).props.value).toBe(true);
    expect(screen.getByRole("switch", { name: "Share walk statistics" }).props.value).toBe(false);

    fireEvent(screen.getByRole("switch", { name: "Personalised places" }), "valueChange", false);
    fireEvent(screen.getByRole("switch", { name: "Share walk statistics" }), "valueChange", true);
    settings.unmount();

    await renderSettings(offeringSharing);
    expect(screen.getByRole("switch", { name: "Personalised places" }).props.value).toBe(false);
    expect(screen.getByRole("switch", { name: "Share walk statistics" }).props.value).toBe(true);
  });

  // Until the data protection officer has signed off walk reports, the app does not offer sharing them.
  test("the sharing switch is not shown while sharing is not offered", async () => {
    await renderSettings();

    expect(screen.queryByRole("switch", { name: "Share walk statistics" })).toBeNull();
    expect(screen.queryByText(/sends statistics without any positions/)).toBeNull();
  });

  // A write before the stored settings arrive would win over them, and with them the install id and an opt-out.
  test("the privacy switches are disabled until the settings have loaded", async () => {
    // The iOS switch, which the tests render, takes `disabled` as a prop rather than as an accessibility state.
    const isDisabled = (name: string) => screen.getByRole("switch", { name }).props.disabled;
    renderSettingsWithoutWaiting(offeringSharing);
    expect(isDisabled("Personalised places")).toBe(true);
    expect(isDisabled("Share walk statistics")).toBe(true);

    await act(async () => {});

    expect(isDisabled("Personalised places")).toBe(false);
    expect(isDisabled("Share walk statistics")).toBe(false);
  });
});
