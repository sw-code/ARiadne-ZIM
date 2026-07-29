import { StyleSheet } from "react-native";
import { AppColors } from "@/src/shared/AppColors";

export const layout = StyleSheet.create({
  spacing10: {
    padding: 10,
    gap: 10,
  },
  fullSize: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centeredColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
});

export const appearance = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: AppColors.DefaultBackground,
  },
  text: {
    fontFamily: "Inter",
    fontWeight: "500",
    fontSize: 13.3735,
    lineHeight: 16,
    color: AppColors.DefaultForeground,
  },
  error: {
    color: AppColors.ErrorForeground,
    backgroundColor: AppColors.ErrorBackground,
  },
});
