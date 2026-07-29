import type { NavigationAction, NavigationState } from "@react-navigation/native";
import type { ScreenParams } from "@/App";

type Routes = NavigationState["routes"];

// Replacing only the AR screen would leave the preview the walk was started from underneath the new one, and Back
// would land on a preview of the old destination. AR is the top screen, since the place card is shown there.
//
// This is the action `CommonActions.reset` builds. Its return type does not fit `navigation.dispatch` under
// `exactOptionalPropertyTypes`, so the action is spelled out.
export function replaceWalkWithPreview(
  { routes }: { routes: Routes },
  previewParams: ScreenParams["RoutePreview"],
): NavigationAction {
  const walkWasStartedFromPreview = routes.at(-2)?.name === "RoutePreview";
  const replacedRouteCount = walkWasStartedFromPreview ? 2 : 1;
  const routesWithPreview = [...routes.slice(0, -replacedRouteCount), { name: "RoutePreview", params: previewParams }];
  return { type: "RESET", payload: { index: routesWithPreview.length - 1, routes: routesWithPreview } };
}
