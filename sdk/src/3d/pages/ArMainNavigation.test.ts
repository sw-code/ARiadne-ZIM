import { StackRouter } from "@react-navigation/native";
import type { ScreenParams } from "@/App";
import { replaceWalkWithPreview } from "@/src/3d/pages/ArMainNavigation";

type Route = { key: string; name: string };

const home: Route = { key: "home-1", name: "Home" };
const testing: Route = { key: "testing-1", name: "Testing" };
const oldPreview: Route = { key: "preview-1", name: "RoutePreview" };
const walk: Route = { key: "ar-1", name: "ARMain" };

const newPreviewParams: ScreenParams["RoutePreview"] = {
  userCoordinates: {
    latitude: 51.5,
    longitude: 7.4,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  targetCoordinate: { latitudeDegrees: 51.51, longitudeDegrees: 7.41 },
};

// Runs the action through the real stack router, the same way the navigator does, instead of comparing action shapes.
function stackAfterNavigatingHere(routes: Route[]) {
  const routeNames = ["Home", "Testing", "RoutePreview", "ARMain"];
  const routerOptions = { routeNames, routeParamList: {}, routeGetIdList: {} };
  const router = StackRouter({});
  const state = {
    stale: false as const,
    type: "stack" as const,
    key: "stack-1",
    index: routes.length - 1,
    routeNames,
    routes,
    preloadedRoutes: [],
  };

  // The navigator hands dispatched actions to the router untyped, while the router's own signature wants its action union.
  const action = replaceWalkWithPreview(state, newPreviewParams) as Parameters<typeof router.getStateForAction>[1];
  const nextState = router.getStateForAction(state, action, routerOptions);
  return router.getRehydratedState(nextState ?? state, routerOptions);
}

describe("replaceWalkWithPreview", () => {
  it("replaces the AR screen and the preview it came from, so Back from the new preview returns to Home", () => {
    const { routes, index } = stackAfterNavigatingHere([home, oldPreview, walk]);

    expect(routes.map(({ name }) => name)).toEqual(["Home", "RoutePreview"]);
    expect(index).toBe(1);
    expect(routes[0]).toEqual(home);
    expect(routes[1]?.params).toEqual(newPreviewParams);
    expect(routes[1]?.key).not.toBe(oldPreview.key); // a new screen, not the old preview with other params
  });

  it("replaces only the AR screen when it was not opened from a preview", () => {
    const { routes, index } = stackAfterNavigatingHere([home, testing, walk]);

    expect(routes.map(({ name }) => name)).toEqual(["Home", "Testing", "RoutePreview"]);
    expect(index).toBe(2);
    expect(routes[2]?.params).toEqual(newPreviewParams);
  });
});
