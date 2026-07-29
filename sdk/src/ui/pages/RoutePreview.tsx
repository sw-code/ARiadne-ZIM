import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  CameraRef,
  CircleLayer,
  type CircleLayerStyle,
  LineLayer,
  MapView,
  type OnPressEvent,
  PointAnnotation,
  ShapeSource,
  UserLocation,
} from "@maplibre/maplibre-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationMode, ScreenParams } from "@/App";
import { Button } from "@/src/ui/components/Button";
import { getRoute, Path } from "@/src/shared/Directions";
import Lucide from "@react-native-vector-icons/lucide";
import { Header } from "@/src/ui/components/Header";
import { GeoCoordinate, geoCoordsFromGPS } from "@/src/shared/GeoLocation";
import { log } from "@/src/shared/Logger";
import { getIntersectionCoords } from "@/src/ui/pages/OverpassService";
import { fetchRankedPointsOfInterest, RankedPointOfInterest } from "@/src/shared/RankedPoiService";
import { fitCameraToBounds, formatDistance, formatDuration } from "@/src/ui/pages/RoutePreviewUtils";
import { AppColors } from "@/src/shared/AppColors";
import { hexColorToRgba } from "@/src/shared/ColorExtensions";
import { SegmentedControl } from "@/src/ui/components/SegmentedControl";
import { useUserProfile } from "@/src/shared/UserProfileProvider";
import { ExploreRoute, proposeExploreRoute } from "@/src/shared/RouteProposal";
import { withTimeout } from "@/src/shared/JavascriptExtensions";
import { PlaceCard, placeCardAnchor } from "@/src/ui/components/PlaceCard";
import { displayedPlaces, engageOnce, placeAtDestination, pressedPlace } from "@/src/ui/pages/routePreviewPlaces";
import { useLanguage, useTranslations } from "@/src/i18n/Translations";

type Props = NativeStackScreenProps<ScreenParams, "RoutePreview">;

const navigationModes: NavigationMode[] = ["explore", "straight"];

const showIntersections = false;

// Explore's Start waits for the direct route, the ranked places, the explore route proposal and the intersections along
// the explore route. Their requests cannot be aborted and the phone's networking has no default timeout, so a server
// that accepts the connection but never answers would keep Explore Mode from ever starting. Each of the four steps gets
// this long, then counts as failed.
const exploreStartStepTimeoutSeconds = 10;

// Places the editors annotated keep the strong dot. Places only the profile picked are smaller and muted, so they
// do not compete with the annotated ones. Inside an expression, MapLibre's native parser rejects the 8-digit hex of
// `AppColors` with "Could not parse color", which left both kinds of places drawn alike.
const pointOfInterestLayerStyle: CircleLayerStyle = {
  circleColor: [
    "case",
    ["get", "isAnnotated"],
    hexColorToRgba(AppColors.DefaultForeground),
    hexColorToRgba(AppColors.MutedForeground),
  ],
  circleRadius: ["case", ["get", "isAnnotated"], 5, 3.5],
  circleStrokeColor: AppColors.DefaultBackground,
  circleStrokeWidth: 2,
};

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
  const { profileForRanking, walkingSpeedMetresPerSecond, recordEngaged } = useUserProfile();

  const cameraRef = useRef<CameraRef>(null);
  const [directPath, setDirectPath] = useState<Path | null>(); // null when GraphHopper had no route
  const [exploreRoute, setExploreRoute] = useState<ExploreRoute>();
  // Kept per route, so switching modes back and forth does not ask Overpass again.
  const [intersectionsByPath, setIntersectionsByPath] = useState(() => new Map<Path, GeoCoordinate[]>());
  const [pointsOfInterest, setPointsOfInterest] = useState<RankedPointOfInterest[]>();
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("explore");
  const [selectedPlace, setSelectedPlace] = useState<RankedPointOfInterest | null>(null);
  const engagedPlaceIds = useRef(new Set<string>());
  const shouldShowPointsOfInterest = navigationMode === "explore";

  // Until the explore route is proposed, Explore Mode shows the direct route, which is also what it falls back to.
  const explorePath = exploreRoute?.path ?? directPath;
  const shownPath = navigationMode === "explore" ? explorePath : directPath;
  const intersectionCoords = shownPath ? intersectionsByPath.get(shownPath) : undefined;
  const shownDistance = shownPath ? formatDistance(shownPath.distance, language) : "";
  const shownDuration = shownPath ? formatDuration(shownPath.time) : "";

  // The AR scene fetches neither places nor intersections itself, so an Explore walk started before the places, the
  // route through them and the intersections along that route are known would go without them for the whole walk.
  const areExploreIntersectionsSettled = !explorePath || intersectionsByPath.has(explorePath);
  const isExploreRouteSettled =
    pointsOfInterest !== undefined &&
    (exploreRoute !== undefined || directPath === null) &&
    areExploreIntersectionsSettled;
  const canStartNavigation = navigationMode === "straight" || isExploreRouteSettled;

  const destinationPlace = useMemo(
    () => pointsOfInterest && placeAtDestination(pointsOfInterest, targetCoordinate),
    [pointsOfInterest, targetCoordinate],
  );
  const pointsOfInterestToDisplay = useMemo(
    () => pointsOfInterest && displayedPlaces(pointsOfInterest, targetCoordinate),
    [pointsOfInterest, targetCoordinate],
  );

  const visiblePointsOfInterest = useMemo<RankedPointOfInterest[]>(
    () => (shouldShowPointsOfInterest ? (pointsOfInterestToDisplay ?? []) : []),
    [pointsOfInterestToDisplay, shouldShowPointsOfInterest],
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
          isAnnotated: poi.isAnnotated,
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

    if (directPath !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Fetching route", {
      user: userCoords,
      target: targetCoordinate,
    });

    withTimeout(getRoute(userCoords, targetCoordinate), exploreStartStepTimeoutSeconds)
      .then((route) => {
        if (!isMounted) return;
        const [path] = route.paths;
        log.info("ROUTE PREVIEW | Route fetched successfully", {
          coordinateCount: path?.points.coordinates.length ?? 0,
          distanceMetres: path?.distance,
          durationMs: path?.time,
        });
        setDirectPath(path ?? null);
      })
      .catch((error) => {
        log.error("RoutePreview: ", error);
        if (!isMounted) return;
        setDirectPath(null);
      });

    return () => {
      isMounted = false;
    };
  }, [directPath, targetCoordinate, userCoords]);

  useEffect(() => {
    let isMounted = true;

    if (!shownPath || intersectionCoords !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Fetching route intersections", {
      routeCoordinateCount: shownPath.points.coordinates.length,
    });

    // Without intersections the walk still navigates, so a failure settles on none rather than holding up the start.
    withTimeout(getIntersectionCoords(shownPath.points.coordinates), exploreStartStepTimeoutSeconds)
      .catch((error) => {
        log.error("OVERPASS | Querying for intersection coordinates failed:", error);
        return [];
      })
      .then((coords) => {
        if (!isMounted) return;
        log.info("ROUTE PREVIEW | Intersections settled", {
          intersectionCount: coords.length,
        });
        setIntersectionsByPath((known) => new Map(known).set(shownPath, coords));
      });

    return () => {
      isMounted = false;
    };
  }, [intersectionCoords, shownPath]);

  useEffect(() => {
    let isMounted = true;

    if (!userCoords || pointsOfInterest !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Fetching ranked points of interest");

    withTimeout(
      fetchRankedPointsOfInterest(userCoords, targetCoordinate, profileForRanking(), t.poiSubtypes),
      exploreStartStepTimeoutSeconds,
    )
      .then((pois) => {
        if (!isMounted) return;
        log.info("ROUTE PREVIEW | Points of interest fetched successfully. Count:", pois.length);
        setPointsOfInterest(pois);
      })
      .catch((error) => {
        log.error("CMS | Querying for ranked points of interest failed:", error);
        if (!isMounted) return;
        setPointsOfInterest([]);
      });

    return () => {
      isMounted = false;
    };
  }, [pointsOfInterest, userCoords, targetCoordinate, profileForRanking, t.poiSubtypes]);

  // Profile only, like a press on the marker: a walk report counts what happened during a walk, and this is no walk.
  useEffect(() => {
    if (destinationPlace) engageOnce(engagedPlaceIds.current, destinationPlace, recordEngaged);
  }, [destinationPlace, recordEngaged]);

  useEffect(() => {
    let isMounted = true;

    if (!directPath || pointsOfInterestToDisplay === undefined || exploreRoute !== undefined) {
      return;
    }

    log.info("ROUTE PREVIEW | Proposing explore route");

    const directRoute: ExploreRoute = { path: directPath, via: null };
    withTimeout(
      proposeExploreRoute(
        userCoords,
        targetCoordinate,
        directPath,
        pointsOfInterestToDisplay,
        walkingSpeedMetresPerSecond(),
      ),
      exploreStartStepTimeoutSeconds,
    )
      .catch((error) => {
        log.warn("ROUTE PREVIEW | Proposing the explore route failed, keeping the direct route:", error);
        return directRoute;
      })
      .then((route) => {
        if (!isMounted) return;
        log.info("ROUTE PREVIEW | Explore route proposed", {
          viaId: route.via?.id ?? null,
          distanceMetres: route.path.distance,
        });
        setExploreRoute(route);
      });

    return () => {
      isMounted = false;
    };
  }, [directPath, exploreRoute, pointsOfInterestToDisplay, targetCoordinate, userCoords, walkingSpeedMetresPerSecond]);

  if (!userCoords) {
    return null;
  }

  // The card belongs to a marker, and Fast Mode shows none.
  const changeNavigationMode = (mode: NavigationMode) => {
    setNavigationMode(mode);
    setSelectedPlace(null);
  };

  const handlePlacePressed = ({ features }: OnPressEvent) => {
    const place = pressedPlace(visiblePointsOfInterest, features);
    if (!place) return;
    // Profile only: a walk report counts what happened during a walk, and this is no walk.
    engageOnce(engagedPlaceIds.current, place, recordEngaged);
    setSelectedPlace(place);
  };

  // Replacing the preview, not pushing one, so Back from the new preview returns to where this one was opened from.
  const handleNavigateHere = (place: RankedPointOfInterest) => {
    navigation.replace("RoutePreview", { userCoordinates, targetCoordinate: place.location.coordinate });
  };

  const startNavigation = () => {
    const navigator = navigationMode === "explore" ? "dog" : "line";
    const via = navigationMode === "explore" ? (exploreRoute?.via ?? null) : null;

    log.info("ROUTE PREVIEW | Starting AR navigation", {
      navigator,
      navigationMode,
      intersectionCount: intersectionCoords?.length ?? 0,
      pointOfInterestCount: visiblePointsOfInterest.length,
      viaId: via?.id ?? null,
    });

    navigation.navigate("ARMain", {
      targetCoordinate: {
        latitudeDegrees: targetCoordinate.latitudeDegrees,
        longitudeDegrees: targetCoordinate.longitudeDegrees,
      },
      routeIntersections: intersectionCoords || [],
      pointsOfInterest: visiblePointsOfInterest,
      via,
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
            {shownDistance} | {shownDuration} | {t.routePreview.locationCount(pointsOfInterestToDisplay?.length ?? 0)}
          </Text>
        </View>
        <SegmentedControl<NavigationMode>
          options={navigationModes.map((mode) => ({ value: mode, name: t.routePreview.navigationModes[mode] }))}
          selectedValue={navigationMode}
          onValueChange={changeNavigationMode}
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
              {shownPath && shownPath.points.coordinates.length > 0 && (
                <ShapeSource
                  id="routeSource"
                  shape={{
                    type: "LineString",
                    coordinates: shownPath.points.coordinates,
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
                <ShapeSource id="pointOfInterestSource" shape={pointOfInterestFeatures} onPress={handlePlacePressed}>
                  <CircleLayer id="pointOfInterestLayer" style={pointOfInterestLayerStyle} />
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
          {selectedPlace && (
            <View pointerEvents="box-none" style={placeCardAnchor}>
              <PlaceCard
                poi={selectedPlace}
                canNavigateHere={selectedPlace !== destinationPlace}
                onNavigateHere={() => handleNavigateHere(selectedPlace)}
                onClose={() => setSelectedPlace(null)}
              />
            </View>
          )}
        </View>
        <View style={styles.buttons}>
          <Button
            variant="primary"
            state={canStartNavigation ? "default" : "loading"}
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
