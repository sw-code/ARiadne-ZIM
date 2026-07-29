import { ArMainPage } from "./src/3d/pages/ArMainPage";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RoutePreview } from "./src/ui/pages/RoutePreview";
import { Home } from "./src/ui/pages/Home";
import { GeoCoordinate } from "./src/shared/GeoLocation";
import { LocationObjectCoords } from "expo-location";
import { GeocoderProvider } from "@/src/geocoding/GeocodingProvider";
import { createGraphhopperAdapter } from "@/src/geocoding/geocodingAdapters/GraphhopperAdapter";
import { PointOfInterest } from "@/src/shared/poi";
import { Testing } from "@/src/ui/pages/Testing";
import { ArTestingPage } from "@/src/3d/pages/ArTestingPage";
import { Settings } from "@/src/ui/pages/Settings";
import { UserProfileProvider } from "@/src/shared/UserProfileProvider";

export type ScreenParams = {
  Home: undefined;
  Settings: undefined;
  Testing: undefined;
  RoutePreview: { userCoordinates: LocationObjectCoords; targetCoordinate: GeoCoordinate };
  ARMain: {
    targetCoordinate: GeoCoordinate;
    routeIntersections: GeoCoordinate[];
    pointsOfInterest: PointOfInterest[];
    navigationMode: NavigationMode;
    navigator: "dog" | "line";
  };
  ARTesting: {
    pointsOfInterest: PointOfInterest[];
  };
};

export const GEO_POSITIONING_UPDATE_INTERVAL = { seconds: 3 };

export type NavigationMode = "explore" | "straight";

export type Street = { start: GeoCoordinate; end: GeoCoordinate; width: number };

const Stack = createNativeStackNavigator<ScreenParams>();
const graphopperGeocoder = createGraphhopperAdapter();

export default function App() {
  return (
    <GeocoderProvider geocoder={graphopperGeocoder}>
      <UserProfileProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={Home} options={{ title: "Home" }} />
            <Stack.Screen name="Settings" component={Settings} options={{ title: "Settings" }} />
            <Stack.Screen name="Testing" component={Testing} options={{ title: "Test Launcher" }} />
            <Stack.Screen name="RoutePreview" component={RoutePreview} options={{ title: "Route Preview" }} />
            <Stack.Screen name="ARMain" component={ArMainPage} options={{ title: "3D" }} />
            <Stack.Screen name="ARTesting" component={ArTestingPage} options={{ title: "3D" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </UserProfileProvider>
    </GeocoderProvider>
  );
}
