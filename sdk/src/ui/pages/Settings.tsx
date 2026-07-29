import React, { useEffect, useState } from "react";
import { ActivityIndicator, InteractionManager, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenParams } from "@/App";
import { Header } from "@/src/ui/components/Header";
import { Button } from "@/src/ui/components/Button";
import { SegmentedControl } from "@/src/ui/components/SegmentedControl";
import { AppColors } from "@/src/shared/AppColors";
import { appearance } from "@/src/shared/Styles";
import { InterestChoice, useUserProfile } from "@/src/shared/UserProfileProvider";
import { useObjectDetectionSetting } from "@/src/3d/objectDetectionSetting";
import { Translations, useTranslations } from "@/src/i18n/Translations";
import { labelOfPointOfInterestSubtype } from "@/src/shared/poiSubtypes";

type Props = NativeStackScreenProps<ScreenParams, "Settings">;

// "Auto" is no choice at all: the app then goes by what it learned.
function interestChoiceOptions(
  labels: Translations["settings"]["interestChoices"],
): { value: InterestChoice | null; name: string }[] {
  return [
    { value: "less", name: labels.less },
    { value: null, name: labels.auto },
    { value: "more", name: labels.more },
  ];
}

// Lists every known location type: those chosen as More first, then by how often the user looked at a
// type they saw. The counts also grow while the user looks at places in AR, so the list reorders live.
export const Settings = ({ navigation }: Props) => {
  const t = useTranslations();
  const profile = useUserProfile();
  const subtypes = profile.listedSubtypes();
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t.settings.personalisedPlaces}</Text>
          <Switch
            accessibilityLabel={t.settings.personalisedPlaces}
            value={profile.isPersonalisationEnabled}
            onValueChange={profile.setPersonalisationEnabled}
            disabled={!profile.areSettingsLoaded}
          />
        </View>
        <Text style={styles.subtitle}>{t.settings.personalisedPlacesDescription}</Text>
        {profile.isWalkReportSharingOffered && (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t.settings.shareWalkStatistics}</Text>
              <Switch
                accessibilityLabel={t.settings.shareWalkStatistics}
                value={profile.isWalkReportSharingEnabled}
                onValueChange={profile.setWalkReportSharingEnabled}
                disabled={!profile.areSettingsLoaded}
              />
            </View>
            <Text style={styles.subtitle}>{t.settings.shareWalkStatisticsDescription}</Text>
          </>
        )}
        <Text style={styles.title}>{t.settings.locationTypes}</Text>
        <Text style={styles.subtitle}>{t.settings.locationTypesDescription}</Text>
        {!isListReady ? (
          <ActivityIndicator style={styles.spinner} color={AppColors.DefaultForeground} />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {subtypes.map((subtype) => {
              const { shown, engaged, choice } = profile.countsOf(subtype);
              return (
                <View key={subtype} testID={`interest-row-${subtype}`} style={styles.row}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowLabel}>{labelOfPointOfInterestSubtype(subtype, t.poiSubtypes)}</Text>
                    <Text style={styles.rowCounts}>{t.settings.interestCounts(shown, engaged)}</Text>
                  </View>
                  <SegmentedControl
                    options={interestChoiceOptions(t.settings.interestChoices)}
                    selectedValue={choice ?? null}
                    onValueChange={(newChoice) => profile.setChoice(subtype, newChoice)}
                  />
                </View>
              );
            })}
          </ScrollView>
        )}
        <Button title={t.settings.resetProfile} startIcon="rotate-ccw" variant="secondary" onPress={profile.reset} />
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
    gap: 8,
    ...appearance.card,
    backgroundColor: AppColors.DefaultBackground,
    borderWidth: 1,
    borderColor: AppColors.ButtonSecondaryBackground,
    padding: 6,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10 },
  rowLabel: { ...appearance.text, flex: 1 },
  rowCounts: { ...appearance.text, color: "#888", marginLeft: 8 },
});
