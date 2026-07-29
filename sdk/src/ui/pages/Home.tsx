import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenParams } from "@/App";
import { Button } from "../components/Button";
import { TextInputComponent } from "../components/TextInput";

import { Text, View, StyleSheet, TouchableWithoutFeedback, Keyboard, TextInput } from "react-native";
import React, { useRef, useState } from "react";
import { DestinationDropDownSelection } from "@/src/ui/components/DestinationDropDownSelection";
import { useGeoCoding } from "@/src/geocoding/GeocodingClient";
import { useDebouncedCallback } from "use-debounce";
import { Header } from "@/src/ui/components/Header";
import { useGeoLocation } from "@/src/shared/GeoLocation";
import { log } from "@/src/shared/Logger";
import { useTranslations } from "@/src/i18n/Translations";

import { appearance, layout } from "@/src/shared/Styles";
import { GeoCoordinate } from "@/src/shared/GeoLocation";

type Props = NativeStackScreenProps<ScreenParams, "Home">;

const MIN_QUERY_LENGTH = 2;

export const Home = ({ navigation }: Props) => {
  const t = useTranslations();
  const [value, setValue] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("");
  const [selectedCoordinates, setSelectedCoordinates] = useState<GeoCoordinate>();
  const [isAddressChosen, setIsAddressChosen] = useState<boolean>(false);
  const inputRef = useRef<TextInput>(null);

  const [userCoordinates, gpsError] = useGeoLocation(true, 10, 10, true);
  const [isInputFieldFocused, setIsInputFieldFocused] = useState(false);

  const {
    geocodingResults,
    isLoading,
    hasGeocodingStatusError,
    geocodeAddressToCoordinate,
    clearGeocodingResults,
    hasGeocodingResult,
  } = useGeoCoding(userCoordinates);

  const isInputValid: boolean = value.trim().length >= MIN_QUERY_LENGTH;
  const debouncedSearch = useDebouncedCallback(geocodeAddressToCoordinate, 500);

  const handleSearch = (text: string) => {
    const trimmedText = text.trim();

    if (trimmedText.length === 0) {
      debouncedSearch.cancel();
      clearGeocodingResults();
      return;
    }
    if (trimmedText.length >= MIN_QUERY_LENGTH) {
      debouncedSearch(trimmedText);
    }
  };

  const handleDataFromChild = (selectedAddress: string, coordinates: GeoCoordinate) => {
    if (selectedAddress.trim() !== "" && coordinates) {
      setSelectedDestination(selectedAddress);
      setSelectedCoordinates(coordinates);
      setIsAddressChosen(true);
      Keyboard.dismiss();
    }
  };

  const handleFocus = () => {
    inputRef.current?.focus();
  };

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        Keyboard.dismiss();
      }}
    >
      <View style={styles.home}>
        <Header onOpenSettings={() => navigation.navigate("Settings")}></Header>
        <View style={styles.containerFrame9}>
          <View style={styles.containerTextFrame5}>
            <Text style={styles.text}>{t.home.welcome}</Text>
            <Text style={styles.text2}>{t.home.whereToGo}</Text>
          </View>
          <View style={styles.containerFrame8}>
            <TextInputComponent
              ref={inputRef}
              onFocusChange={(focused) => setIsInputFieldFocused(focused)}
              hasGeocodingResult={hasGeocodingResult}
              value={isAddressChosen ? selectedDestination : value}
              isAddressChosen={isAddressChosen}
              isLoading={isLoading}
              onTextChange={(text: string) => {
                setIsAddressChosen(false);
                setValue(text);
                handleSearch(text);
              }}
              editable={!!userCoordinates}
            />
            {!isAddressChosen &&
              isInputValid &&
              (isLoading ||
                hasGeocodingResult ||
                hasGeocodingStatusError ||
                (!hasGeocodingResult && isInputFieldFocused)) && (
                <DestinationDropDownSelection
                  geocodingResults={geocodingResults}
                  onSendData={handleDataFromChild}
                  hasGeocodingStatusError={hasGeocodingStatusError}
                  isLoading={isLoading}
                  hasGeocodingResult={hasGeocodingResult}
                  isInputFieldFocused={isInputFieldFocused}
                ></DestinationDropDownSelection>
              )}
          </View>

          {gpsError && (
            <View
              style={{
                ...layout.centeredColumn,
                ...layout.spacing10,
                ...appearance.card,
                backgroundColor: appearance.error.backgroundColor,
              }}
            >
              <Text style={{ ...appearance.text, color: appearance.error.color }} accessible={true}>
                {gpsError}
              </Text>
            </View>
          )}

          {!gpsError && (
            <View style={{ paddingTop: 110 }}>
              <Button
                variant="primary"
                state={userCoordinates ? "default" : "loading"}
                title={t.home.exploreRoute}
                onPress={() => {
                  if (!userCoordinates) {
                    log.error("Cannot continue without user coordinates!");
                    return;
                  }

                  if (isAddressChosen && isInputValid && selectedCoordinates) {
                    navigation.navigate("RoutePreview", {
                      userCoordinates: userCoordinates,
                      targetCoordinate: {
                        latitudeDegrees: selectedCoordinates.latitudeDegrees,
                        longitudeDegrees: selectedCoordinates.longitudeDegrees,
                      },
                    });
                  } else {
                    handleFocus();
                  }
                }}
                endIcon="arrow-right"
              />
            </View>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  home: { backgroundColor: "white", flexDirection: "column", alignItems: "flex-end" },

  containerFrame9: {
    paddingTop: 50,
    paddingRight: 40,
    paddingBottom: 100,
    paddingLeft: 40,
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "stretch",
    alignSelf: "stretch",
    flexGrow: 1,
    flexShrink: 0,
  },

  text: {
    color: "#000",
    textAlign: "center",
    fontFamily: "Inter",
    fontSize: 13.373,
    fontStyle: "normal",
    fontWeight: "700",
    letterSpacing: 0.802,
    textTransform: "uppercase",
  },
  text2: {
    color: "#000",
    textAlign: "center",
    fontFamily: "Inter",
    fontSize: 13.373,
    fontStyle: "normal",
    fontWeight: "400",
    letterSpacing: 0.802,
  },
  containerTextFrame5: {
    display: "flex",
    height: 200,
    flexDirection: "column",
    gap: 10,
    alignSelf: "stretch",
  },
  containerFrame8: {
    height: 350,
    flexDirection: "column",
    alignSelf: "stretch",
    alignItems: "stretch",
    gap: 10,
    padding: 10,
  },
  button: {
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    alignSelf: "stretch",
  },
});
