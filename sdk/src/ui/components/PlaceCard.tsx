import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { Button } from "@/src/ui/components/Button";
import { appearance, layout } from "@/src/shared/Styles";
import { PointOfInterest } from "@/src/shared/poi";
import { labelOfPointOfInterestSubtype } from "@/src/shared/poiSubtypes";
import { useTranslations } from "@/src/i18n/Translations";

type PlaceCardProps = {
  poi: PointOfInterest;
  onNavigateHere: () => void;
  onClose: () => void;
  canNavigateHere?: boolean; // false while the route cannot start (no location yet) or already leads to the place
};

// The card covers the bottom of the map or the AR view. Like the AR panel, it cuts long annotations off after four lines
// rather than covering more of the view.
const maxAnnotationLines = 4;

// Lays the card over the bottom of a full-screen view, the map or AR.
export const placeCardAnchor: ViewStyle = {
  ...layout.fullSize,
  justifyContent: "flex-end",
  padding: 10,
};

export function PlaceCard({ poi, onNavigateHere, onClose, canNavigateHere = true }: PlaceCardProps) {
  const t = useTranslations();
  const name = poi.info?.name ?? labelOfPointOfInterestSubtype(poi.subtype, t.poiSubtypes);
  const annotationText = poi.info?.description;

  return (
    <View style={[appearance.card, layout.spacing10, styles.card]}>
      <Text style={[appearance.text, styles.name]}>{name}</Text>
      {annotationText ? (
        <Text style={appearance.text} numberOfLines={maxAnnotationLines}>
          {annotationText}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button
            title={t.placeCard.navigateHere}
            variant="primary"
            state={canNavigateHere ? "default" : "disabled"}
            onPress={onNavigateHere}
          />
        </View>
        <View style={styles.button}>
          <Button title={t.placeCard.close} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
  },
  name: {
    fontWeight: "bold",
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
  },
});
