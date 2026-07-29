import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { AppColors } from "@/src/shared/AppColors";
import { appearance } from "@/src/shared/Styles";
import { Button } from "@/src/ui/components/Button";

type SegmentedControlProps<T> = {
  options: { value: T; name: string }[];
  selectedValue: T | null;
  onValueChange: (item: T) => void;
  direction?: "vertical" | "horizontal";
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T>({
  options,
  selectedValue,
  onValueChange,
  direction = "horizontal",
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, styles[direction], style]}>
      {options.map((option) => {
        const isSelected = option.value === selectedValue;

        return (
          <View style={direction === "horizontal" && styles.horizontalSegment} key={option.name}>
            <Button
              title={option.name}
              onPress={() => onValueChange(option.value)}
              variant={isSelected ? "primary" : "secondary"}
              startIcon={isSelected ? "circle-check" : "circle"}
              align="start"
            />
          </View>
        );
      })}
    </View>
  );
}

const spacing = 4;

const styles = StyleSheet.create({
  container: {
    display: "flex",
    gap: spacing,
    padding: spacing,
    backgroundColor: AppColors.ButtonSecondaryBackground,
    borderRadius: appearance.card.borderRadius + spacing,
  },
  vertical: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  horizontal: {
    flexDirection: "row",
  },
  horizontalSegment: {
    flex: 1,
  },
});
