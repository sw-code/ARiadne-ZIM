import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  CameraRef,
  CircleLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationMode, ScreenParams } from "@/App";
import { Button } from "@/src/ui/components/Button";
import { getRoute } from "@/src/shared/Directions";
import Lucide from "@react-native-vector-icons/lucide";
import { Header } from "@/src/ui/components/Header";
import { GeoCoordinate, geoCoordsFromGPS } from "@/src/shared/GeoLocation";
import { log } from "@/src/shared/Logger";
import { getIntersectionCoords } from "@/src/ui/pages/OverpassService";
import { fetchAnnotatedPointsOfInterest } from "@/src/shared/AnnotatedPoiService";
import { fitCameraToBounds, formatDistance, formatDuration } from "@/src/ui/pages/RoutePreviewUtils";
import { AppColors } from "@/src/shared/AppColors";
import { PointOfInterest } from "@/src/shared/poi";
import { SegmentedControl } from "@/src/ui/components/SegmentedControl";
import { useUserProfile } from "@/src/shared/UserProfileProvider";
import { useLanguage, useTranslations } from "@/src/i18n/Translations";

type RouteInfos = {
  distance: string;
  time: string;
  routeCoords: [number, number][];
};

type Props = NativeStackScreenProps<ScreenParams, "RoutePreview">;

const navigationModes: NavigationMode[] = ["explore", "straight"];

const showIntersections = false;

export const RoutePreview: React.FC<Props> = ({ navigation, route }: Props) => {
  const { targetCoordinate, userCoordinates } = route.params;
  const t = useTranslations();
  const language = useLanguage();
  const mapStyleUrl = "https://tiles.openfreemap.org/styles/liberty";
  const targetLocAsArray = useMemo<[number, number]>(() => {
    return [targetCoordinate.longitudeDegrees, targetCoordinate.latitudeDegrees];
  }, [targetCoordinate]);

  const userLocAsArray = useMemo<[number, number]>(() => {
    return [userCoordinates.longitude, userCoordinates.latitude];
  }, [userCoordinates]);

  const userCoords = useMemo(() => userCoordinates && geoCoordsFromGPS(userCoordinates), [userCoordinates]);

  const [routeInfos, setRouteInfos] = useState<RouteInfos>({
    distance: "",
    time: "",
    routeCoords: [],
  });
  const cameraRef = useRef<CameraRef>(null);
  const [intersectionCoords, setIntersectionCoords] = useState<GeoCoordinate[]>();
  const [pointsOfInterest, setPointsOfInterest] = useState<PointOfInterest[]>();
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("explore");
  const shouldShowPointsOfInterest = navigationMode === "explore";
  const { registerSubtypes } = useUserProfile();

  const visiblePointsOfInterest = useMemo<PointOfInterest[]>(
    () => (shouldShowPointsOfInterest ? (pointsOfInterest ?? []) : []),
    [pointsOfInterest, shouldShowPointsOfInterest],
  );

  const pointOfInterestFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visiblePointsOfInterest.map((poi) => ({
        type: "Feature" as const,
        id: poi.id,
        properties: {
          type: poi.category,
          name: poi.info?.name ?? poi.subtype,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [poi.location.coordinate.longitudeDegrees, poi.location.coordinate.latitudeDegrees] as [
            number,
            number,
          ],
        },
      })),
    }),
    [visiblePointsOfInterest],
  );

  const intersectionFeatures = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (intersectionCoords ?? []).map((coord, index) => ({
        type: "Feature" as const,
        id: `intersection-${index}`,
        properties: {},
        geometry: {
          type: "Point" as const,
          coordinates: [coord.longitudeDegrees, coord.latitudeDegrees] as [number, number],
        },
      })),
    }),
    [intersectionCoords],
  );

  useEffect(() => {
    let isMounted = true;
    if (routeInfos.routeCoords.length === 0 && !routeInfos.distance && !routeInfos.time) {
      log.info("ROUTE PREVIEW | Fetching route", {
        user: userCoords,
        target: targetCoordinate,
      });

      getRoute(userCoords, targetCoordinate)
        .then((route) => {
          const coords = route.paths.flatMap((path) => path.points.coordinates);
          const rawDistance = route.paths.map((path) => path.distance);
          const rawTime = route.paths.map((path) => path.time);

          if (isMounted && coords && rawDistance[0] && rawTime[0]) {
            log.info("ROUTE PREVIEW | Route fetched successfully", {
              segments: route.paths.length,
              coordinateCount: coords.length,
              distanceMetres: rawDistance[0],
              durationMs: rawTime[0],
            });

            setRouteInfos({
              distance: formatDistance(rawDistance[0], language),
              time: formatDuration(rawTime[0]),
              routeCoords: coords,
            });
          }
        })
        .catch((error) => {
          log.error("RoutePreview: ", error);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [language, routeInfos, targetCoordinate, userCoords]);

  useEffect(() => {
    let isMounted = true;

    if (routeInfos.routeCoords.length === 0 || intersectionCoords !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Fetching route intersections", {
      routeCoordinateCount: routeInfos.routeCoords.length,
    });

    getIntersectionCoords(routeInfos.routeCoords)
      .then((coords) => {
        if (!isMounted) return;
        log.info("ROUTE PREVIEW | Intersections fetched successfully", {
          intersectionCount: coords.length,
        });
        setIntersectionCoords(coords);
      })
      .catch((error) => {
        log.error("OVERPASS | Querying for intersection coordinates failed:", error);
      });

    return () => {
      isMounted = false;
    };
  }, [intersectionCoords, routeInfos.routeCoords]);

  useEffect(() => {
    let isMounted = true;

    if (pointsOfInterest !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Fetching annotated points of interest");

    fetchAnnotatedPointsOfInterest(t.poiSubtypes)
      .then((pois) => {
        if (!isMounted) return;
        log.info("ROUTE PREVIEW | Points of interest fetched successfully. Count:", pois.length);
        registerSubtypes(pois.map((poi) => poi.subtype));
        setPointsOfInterest(pois);
      })
      .catch((error) => {
        log.error("CMS | Querying for annotated points of interest failed:", error);
        if (!isMounted) return;
        setPointsOfInterest([]);
      });

    return () => {
      isMounted = false;
    };
  }, [pointsOfInterest, registerSubtypes, t.poiSubtypes]);

  if (!userCoords) {
    return null;
  }

  const startNavigation = () => {
    const navigator = navigationMode === "explore" ? "dog" : "line";

    log.info("ROUTE PREVIEW | Starting AR navigation", {
      navigator,
      navigationMode,
      intersectionCount: intersectionCoords?.length ?? 0,
      pointOfInterestCount: visiblePointsOfInterest.length,
    });

    navigation.navigate("ARMain", {
      targetCoordinate: {
        latitudeDegrees: targetCoordinate.latitudeDegrees,
        longitudeDegrees: targetCoordinate.longitudeDegrees,
      },
      routeIntersections: intersectionCoords || [],
      pointsOfInterest: visiblePointsOfInterest,
      navigationMode,
      navigator,
    });
  };

  return (
    <View style={styles.page}>
      <Header onBack={navigation.goBack} onOpenSettings={() => navigation.navigate("Settings")}></Header>
      <View style={styles.containerFrame9}>
        <View style={styles.containerTextFrame5}>
          <Text style={styles.text}>{t.routePreview.title}</Text>
          <Text style={styles.text2}>
            {routeInfos.distance} | {routeInfos.time} | {t.routePreview.locationCount(pointsOfInterest?.length ?? 0)}
          </Text>
        </View>
        <SegmentedControl<NavigationMode>
          options={navigationModes.map((mode) => ({ value: mode, name: t.routePreview.navigationModes[mode] }))}
          selectedValue={navigationMode}
          onValueChange={setNavigationMode}
          style={styles.navigationModeControl}
        />
        <View style={styles.containerFrame8}>
          {mapStyleUrl && (
            <MapView
              style={styles.map}
              mapStyle={mapStyleUrl}
              logoEnabled={false}
              attributionEnabled={false}
              onWillStartRenderingMap={() => {
                fitCameraToBounds(cameraRef.current, userLocAsArray, targetLocAsArray);
              }}
            >
              <Camera ref={cameraRef} />
              <UserLocation
                animated={true}
                visible={true}
                showsUserHeadingIndicator={true}
                androidRenderMode="compass"
                renderMode="native"
              ></UserLocation>
              {routeInfos.routeCoords?.length > 0 && (
                <ShapeSource
                  id="routeSource"
                  shape={{
                    type: "LineString",
                    coordinates: routeInfos.routeCoords,
                  }}
                >
                  <LineLayer id="routeLayer" style={{ lineColor: "black", lineWidth: 4 }} />
                </ShapeSource>
              )}
              {showIntersections && (intersectionCoords?.length ?? 0) > 0 && (
                <ShapeSource id="intersectionSource" shape={intersectionFeatures}>
                  <CircleLayer
                    id="intersectionLayer"
                    style={{
                      circleColor: AppColors.DefaultForeground,
                      circleRadius: 4,
                      circleStrokeColor: AppColors.DefaultBackground,
                      circleStrokeWidth: 1.5,
                    }}
                  />
                </ShapeSource>
              )}
              {pointOfInterestFeatures.features.length > 0 && (
                <ShapeSource id="pointOfInterestSource" shape={pointOfInterestFeatures}>
                  <CircleLayer
                    id="pointOfInterestLayer"
                    style={{
                      circleColor: AppColors.DefaultForeground,
                      circleRadius: 5,
                      circleStrokeColor: AppColors.DefaultBackground,
                      circleStrokeWidth: 2,
                    }}
                  />
                </ShapeSource>
              )}
              {targetCoordinate && (
                <PointAnnotation id="marker1" coordinate={targetLocAsArray}>
                  <View style={styles.marker}>
                    <Lucide name={"map-pin"} color={"white"} size={24} />
                  </View>
                </PointAnnotation>
              )}
            </MapView>
          )}
        </View>
        <View style={styles.buttons}>
          <Button
            variant="primary"
            state="default"
            title={t.routePreview.startJourney}
            onPress={() => {
              startNavigation();
            }}
            endIcon="arrow-right"
          />
          <Button
            variant="secondary"
            state="default"
            title={t.routePreview.cancel}
            onPress={() => {
              navigation.goBack();
            }}
            startIcon="x"
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  page: { backgroundColor: AppColors.DefaultBackground, flex: 1 },
  map: { flex: 1 },
  marker: {
    backgroundColor: AppColors.ButtonPrimaryForeground,
    padding: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  buttons: {
    padding: 10,
    justifyContent: "center",
    alignItems: "stretch",
    gap: 10,
    alignSelf: "stretch",
  },
  navigationModeControl: {
    marginBottom: 16,
  },
  containerFrame9: {
    paddingTop: 50,
    paddingRight: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    flexDirection: "column",
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
    height: 80,
    flexDirection: "column",
    gap: 10,
    alignSelf: "stretch",
  },
  containerFrame8: {
    height: 500,
    flexDirection: "column",
    alignSelf: "stretch",
    alignItems: "stretch",
  },
});
