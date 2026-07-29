import { View, Text } from "react-native";
import { layout, appearance } from "@/src/shared/Styles";
import { useTranslations } from "@/src/i18n/Translations";

export type Stage =
  | "initializing"
  | "loading-route"
  | "not-tracking"
  | "internet-lost"
  | "gps-lost"
  | "permission-denied"
  | "running";

type Props = {
  stage: Stage;
};

export const Loading3dHint = ({ stage }: Props) => {
  const t = useTranslations();

  if (stage === "running") {
    return null;
  } else {
    const { title, details } = t.loadingHints[stage];

    return (
      <View style={{ ...layout.spacing10, ...appearance.card }}>
        <Text style={appearance.text}>{title}</Text>
        <Text style={appearance.text}>{details}</Text>
      </View>
    );
  }
};
