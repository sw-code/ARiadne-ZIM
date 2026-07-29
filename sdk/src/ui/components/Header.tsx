import { StyleSheet, View } from "react-native";
import React from "react";
import { Button } from "./Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "@/src/i18n/Translations";

type HeaderProps = {
  onBack?: () => void;
  onOpenSettings?: () => void;
};

export const Header: React.FC<HeaderProps> = ({ onBack, onOpenSettings }) => {
  const insets = useSafeAreaInsets();
  const t = useTranslations();

  const backButton = onBack ? (
    <View style={styles.backButtonContainer}>
      <Button title={t.header.back} onPress={onBack} variant="secondary" startIcon="arrow-left" />
    </View>
  ) : null;

  const settingsButton = onOpenSettings ? (
    <View style={styles.settingsButtonContainer}>
      <Button title={t.header.settings} onPress={onOpenSettings} variant="secondary" startIcon="settings" />
    </View>
  ) : null;

  return (
    <View style={{ ...styles.header, paddingTop: insets.top }}>
      {backButton}
      {settingsButton}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: "transparent",
    flexDirection: "row",
    alignSelf: "stretch",
    paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 45,
    paddingRight: 45,
    flexShrink: 0,
    gap: 50,
  },

  backButtonContainer: {
    flex: 1,
    alignItems: "flex-start",
    alignSelf: "center",
  },

  settingsButtonContainer: {
    flex: 1,
    alignItems: "flex-end",
    alignSelf: "center",
  },
});
