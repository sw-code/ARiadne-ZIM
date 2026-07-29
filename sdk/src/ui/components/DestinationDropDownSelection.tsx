import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Lucide from "@react-native-vector-icons/lucide";
import { AppColors } from "@/src/shared/AppColors";
import React, { useEffect, useState } from "react";
import { GeocodeResult } from "@/src/geocoding/GeocodingTypes";
import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { useTranslations } from "@/src/i18n/Translations";

type DestinationDropDownSelectionProps = {
  geocodingResults?: GeocodeResult[];
  onSendData: (selectedAddress: string, coordinates: GeoCoordinate) => void;
  hasGeocodingStatusError: boolean;
  isLoading?: boolean;
  hasGeocodingResult?: boolean;
  isInputFieldFocused?: boolean;
};

export function getSuggestionTexts(item: GeocodeResult): {
  primaryText: string;
  secondaryText: string;
  hasStreet: boolean;
} {
  const { street, housenumber, city, postcode } = item;

  const secondaryText = [city, postcode].filter(Boolean).join(" ").trim();
  const hasStreet = Boolean(street);
  const primaryText = hasStreet ? [street, housenumber].filter(Boolean).join(" ").trim() : secondaryText;

  return { primaryText, secondaryText, hasStreet };
}

export const DestinationDropDownSelection: React.FC<DestinationDropDownSelectionProps> = ({
  onSendData,
  geocodingResults,
  isLoading,
  hasGeocodingStatusError,
  hasGeocodingResult = false,
  isInputFieldFocused,
}) => {
  const t = useTranslations();
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  function insertLoadingSuggestion() {
    return (
      <>
        <View style={[styles.frame2base, styles.backgroundDefault]}>
          <ActivityIndicator style={styles.loadingIcon} color={AppColors.DefaultForeground} size={24} />

          <View style={styles.frame4}>
            <Text style={[styles.text1, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
              {t.destinationSuggestions.loading}
            </Text>
            <Text style={[styles.text2, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
              {t.destinationSuggestions.loadingTakesLonger}
            </Text>
          </View>
        </View>
      </>
    );
  }

  function insertError() {
    return (
      <View style={[styles.frame2base, styles.backgroundError]}>
        <Lucide name={"circle-alert"} style={[styles.loadingIcon, styles.foregroundError]} size={24} />
        <View style={styles.frame4}>
          <Text style={[styles.text1, styles.foregroundError]} numberOfLines={1} ellipsizeMode="tail">
            {t.destinationSuggestions.loadingFailed}
          </Text>
          <Text style={[styles.text2, styles.foregroundError]} numberOfLines={1} ellipsizeMode="tail">
            {t.destinationSuggestions.somethingWentWrong}
          </Text>
        </View>
      </View>
    );
  }

  function insertNoPlaceFound() {
    return (
      <View style={[styles.frame2base, styles.noPlaceFoundBorderColor]}>
        <Lucide name={"circle-alert"} style={styles.foregroundDefault} size={24} />
        <View style={styles.frame4}>
          <Text style={[styles.text1, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
            {t.destinationSuggestions.noPlaceFound}
          </Text>
          <Text style={[styles.text2, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
            {t.destinationSuggestions.enterKnownLocation}
          </Text>
        </View>
      </View>
    );
  }

  const handleSelect = (item: GeocodeResult) => {
    const fullAddress = [item.street, item.housenumber, item.city, item.postcode].filter(Boolean).join(" ");
    onSendData(fullAddress, item.coordinates);
  };

  function renderSuggestionList(): React.ReactNode {
    if (!geocodingResults || geocodingResults.length === 0) {
      return null;
    }

    return geocodingResults.map((item, idx) => {
      const { primaryText, secondaryText, hasStreet } = getSuggestionTexts(item);

      return (
        <TouchableOpacity key={idx} onPress={() => handleSelect(item)}>
          <View style={[styles.frame2base, styles.backgroundDefault]}>
            <Lucide name="map-pin" size={24} style={styles.loadingIcon} />
            <View style={styles.frame4}>
              <Text style={[styles.text1, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
                {primaryText}
              </Text>

              {hasStreet && secondaryText ? (
                <Text style={[styles.text2, styles.foregroundDefault]} numberOfLines={1} ellipsizeMode="tail">
                  {secondaryText}
                </Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  }

  useEffect(() => {
    if (isLoading) {
      setHasLoadedOnce(true);
    }
  }, [isLoading]);

  function insertSuggestion() {
    if (hasGeocodingStatusError) {
      return insertError();
    } else if (isLoading) {
      return insertLoadingSuggestion();
    } else if (isInputFieldFocused && !hasGeocodingResult && !isLoading && hasLoadedOnce) {
      return insertNoPlaceFound();
    } else {
      return renderSuggestionList();
    }
  }

  return (
    <View style={styles.destinationDropdownSelection}>
      <View style={styles.frame3}>
        <View style={styles.suggestion}>{insertSuggestion()}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingIcon: {
    flexShrink: 0,
  },
  frame4: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 6,
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
  },
  destinationDropdownSelection: {
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 4,
  },
  frame3: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    alignSelf: "stretch",
  },
  frame2base: {
    flexDirection: "row",
    padding: 10,
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },

  suggestion: {
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 5,
  },
  arInitializationHint: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
    alignSelf: "stretch",
    borderRadius: 8,
  },

  text1: {
    alignSelf: "stretch",
    overflow: "hidden",
    fontFamily: "Inter",
    fontSize: 13.373,
    fontStyle: "normal",
    fontWeight: "700",
    lineHeight: 13.373,
  },

  text2: {
    overflow: "hidden",
    fontFamily: "Inter",
    fontSize: 13.373,
    fontStyle: "normal",
    fontWeight: "400",
    lineHeight: 13.373,
  },

  foregroundDefault: {
    color: AppColors.DefaultForeground,
  },

  backgroundDefault: {
    backgroundColor: AppColors.ButtonSecondaryBackground,
  },

  backgroundError: {
    backgroundColor: AppColors.ErrorBackground,
  },
  foregroundError: {
    color: AppColors.ErrorForeground,
  },

  noPlaceFoundBorderColor: {
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: AppColors.ButtonSecondaryBackground,
  },
});
