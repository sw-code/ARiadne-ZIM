import React, { useEffect, useState } from "react";
import { ActivityIndicator, InteractionManager, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenParams } from "@/App";
import { Header } from "@/src/ui/components/Header";
import { Button } from "@/src/ui/components/Button";
import { AppColors } from "@/src/shared/AppColors";
import { appearance } from "@/src/shared/Styles";
import { useUserProfile } from "@/src/shared/UserProfileProvider";
import { formatDecimal } from "@/src/shared/JavascriptExtensions";
import { useObjectDetectionSetting } from "@/src/3d/objectDetectionSetting";
import { Language, useLanguage, useTranslations } from "@/src/i18n/Translations";
import { labelOfPointOfInterestSubtype } from "@/src/shared/poiSubtypes";

type Props = NativeStackScreenProps<ScreenParams, "Settings">;

// Shows dwell time to a tenth of a second, so the closely-spaced initial values (types are seeded
// ~0.2s apart) stay visually distinct in the list rather than collapsing to the same rounded value.
function formatDwellTime(seconds: number, language: Language): string {
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = formatDecimal(seconds - minutes * 60, 1, language);
  return minutes > 0 ? `${minutes}m ${remainderSeconds}s` : `${remainderSeconds}s`;
}

// Lists every known location type ordered by priority. Priorities also rise on their own while the
// user looks at such locations in AR, so this list reorders live during app usage. The map and AR
// currently show the nearest annotated places and do not consult these priorities.
export const Settings = ({ navigation }: Props) => {
  const t = useTranslations();
  const language = useLanguage();
  const profile = useUserProfile();
  const subtypes = profile.orderedSubtypes();
  const [isObjectDetectionEnabled, setObjectDetectionEnabled, isObjectDetectionSettingLoaded] =
    useObjectDetectionSetting();

  // Render the (long) list only after the navigation transition finishes, so the screen appears
  // immediately with a spinner instead of freezing on the previous page while it builds.
  const [isListReady, setIsListReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setIsListReady(true));
    return () => task.cancel();
  }, []);

  return (
    <View style={styles.page}>
      <Header onBack={navigation.goBack} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t.settings.objectDetection}</Text>
          <Switch
            accessibilityLabel={t.settings.objectDetection}
            value={isObjectDetectionEnabled}
            onValueChange={setObjectDetectionEnabled}
            disabled={!isObjectDetectionSettingLoaded}
          />
        </View>
        <Text style={styles.subtitle}>{t.settings.objectDetectionDescription}</Text>
        <Text style={styles.title}>{t.settings.locationTypes}</Text>
        <Text style={styles.subtitle}>{t.settings.locationTypesDescription}</Text>
        {!isListReady ? (
          <ActivityIndicator style={styles.spinner} color={AppColors.DefaultForeground} />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {subtypes.map((subtype, index) => (
              <View key={subtype} style={styles.row}>
                <Text style={styles.rowLabel}>{labelOfPointOfInterestSubtype(subtype, t.poiSubtypes)}</Text>
                <Text style={styles.rowDwell}>{formatDwellTime(profile.dwellSecondsOf(subtype), language)}</Text>
                <View style={styles.rowButtons}>
                  <Button
                    title={t.settings.moveUp}
                    startIcon="chevron-up"
                    variant="secondary"
                    onPress={() => profile.moveUp(subtype)}
                    state={index === 0 ? "disabled" : "default"}
                  />
                  <Button
                    title={t.settings.moveDown}
                    startIcon="chevron-down"
                    variant="secondary"
                    onPress={() => profile.moveDown(subtype)}
                    state={index === subtypes.length - 1 ? "disabled" : "default"}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <Button title={t.settings.resetToDefaults} startIcon="rotate-ccw" variant="secondary" onPress={profile.reset} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { backgroundColor: AppColors.DefaultBackground, flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 40,
    paddingBottom: 40,
    gap: 10,
  },
  title: {
    ...appearance.text,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.802,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subtitle: appearance.text,
  spinner: { marginTop: 40 },
  list: { flex: 1 },
  listContent: { gap: 8, paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...appearance.card,
    backgroundColor: AppColors.DefaultBackground,
    borderWidth: 1,
    borderColor: AppColors.ButtonSecondaryBackground,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  rowLabel: { ...appearance.text, flex: 1 },
  rowDwell: { ...appearance.text, color: "#888", marginHorizontal: 8 },
  rowButtons: { flexDirection: "row", gap: 4 },
});
