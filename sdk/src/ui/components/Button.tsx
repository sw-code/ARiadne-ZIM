import React from "react";
import { Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp, TextStyle, ActivityIndicator } from "react-native";

import Lucide from "@react-native-vector-icons/lucide";
import { AppColors } from "@/src/shared/AppColors";

import glyphMapJson from "node_modules/@react-native-vector-icons/lucide/glyphmaps/Lucide.json";
type LucideIconName = keyof typeof glyphMapJson | "loading-indicator";

type ColorScheme = "primary" | "secondary";

type State = "default" | "disabled" | "loading";

type ButtonProps = {
  title: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  state?: State;
  variant: ColorScheme;
  startIcon?: LucideIconName;
  endIcon?: LucideIconName;
  size?: "compact" | "big";
  align?: "start" | "center";
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant,
  state = "default",
  startIcon,
  endIcon,
  onPressIn,
  onPressOut,
  size = "compact",
  align = "center",
}) => {
  const isButtonDisabled: boolean = state !== "default";
  const isButtonPrimary: boolean = variant === "primary";
  const isLoading: boolean = state === "loading";
  const sharedOpacityStyle = {
    opacity: 0.7,
  };

  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    isButtonPrimary ? styles.containerPrimary : styles.containerSecondary,
    isButtonDisabled && sharedOpacityStyle,
    size === "big" ? styles.bigLayout : {},
    { justifyContent: align === "start" ? "flex-start" : "center" },
  ];

  const labelStyle: StyleProp<TextStyle> = [
    styles.labelBase,
    isButtonPrimary ? styles.labelIconPrimary : styles.labelIconSecondary,
  ];

  const iconStyle: StyleProp<TextStyle> = [
    styles.iconBase,
    isButtonPrimary ? styles.labelIconPrimary : styles.labelIconSecondary,
  ];

  function renderIcon(icon?: LucideIconName) {
    if (icon) {
      if (icon === "loading-indicator") {
        return <ActivityIndicator color={isButtonPrimary ? "white" : "black"} size={16} />;
      } else {
        return <Lucide name={icon} style={[iconStyle]}></Lucide>;
      }
    } else {
      return null;
    }
  }

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isButtonDisabled}
    >
      {renderIcon(startIcon)}
      <Text style={labelStyle}>{title}</Text>
      {renderIcon(isLoading ? "loading-indicator" : endIcon)}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
    gap: 10,
    borderRadius: 8,
  },
  bigLayout: {
    flexDirection: "column",
    padding: 40,
  },
  containerPrimary: {
    backgroundColor: AppColors.ButtonPrimaryBackground,
  },
  containerSecondary: {
    backgroundColor: AppColors.ButtonSecondaryBackground,
  },
  labelBase: {
    fontFamily: "Inter",
    fontWeight: "500",
    fontSize: 13.3735,
    lineHeight: 16,
    textAlign: "center",
    textTransform: "uppercase",
  },
  labelIconPrimary: {
    color: AppColors.ButtonPrimaryForeground,
  },
  labelIconSecondary: {
    color: AppColors.ButtonSecondaryForeground,
  },
  iconBase: {
    fontSize: 16,
    flexShrink: 0,
  },
});
