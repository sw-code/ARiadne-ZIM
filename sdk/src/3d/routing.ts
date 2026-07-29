import { useEffect, useMemo, useRef, useState } from "react";
import { distanceMetres, GeoCoordinate } from "@/src/shared/GeoLocation";
import { getRoute, Path } from "@/src/shared/Directions";
import { secondsToMillis } from "@/src/shared/math";
import { RouteProps } from "@/src/3d/components/Navigation";
import { useInterval } from "react-timing-hooks";
import { exponentialBackoffSeconds } from "@/src/shared/JavascriptExtensions";
import { currentAbsoluteTime } from "@/src/shared/ReactExtensions";

// Places sit beside the path and GPS is off by a few metres, so walking past one counts as having been there.
const viaReachedRadiusMetres = 20;

const routeCheckIntervalSeconds = 1;

// Retrying a failed request at every check ran into GraphHopper's per-minute limit, which then answered "Minutely API
// limit heavily violated". So after a failure the next request waits 2, 4, 8, 16, then at most 30 s.
const firstRetryDelaySeconds = 2;
const maxRetryDelaySeconds = 30;

/// Based on destination and user location, determines the current route.
/// Might fetch a new route when the user moves far enough from the last route.
/// Every route leads through the via point until the user has been near it once.
export function useRouting(
  userLocation: GeoCoordinate | null,
  destinationCoordinate: GeoCoordinate,
  via: GeoCoordinate | null,
): RouteProps {
  const [isOffTrack, setIsOffTrack] = useState<boolean>(true);
  const [path, setPath] = useState<Path | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  // Remembered rather than measured anew, so a reroute after the visit does not send the user back to the place.
  const [hasReachedVia, setHasReachedVia] = useState<boolean>(false);
  useEffect(() => {
    if (via && userLocation && distanceMetres(userLocation, via) <= viaReachedRadiusMetres) {
      setHasReachedVia(true);
    }
  }, [userLocation, via]);

  // Refs, not state: nothing is drawn from them.
  const consecutiveFailureCount = useRef(0);
  const retryNotBeforeSeconds = useRef(0);

  // every few seconds, if necessary, request a new route
  useInterval(
    () => {
      const needsInitialization = path === null;
      const hasLocation = userLocation !== null;
      const isWaitingToRetry = currentAbsoluteTime().nowSeconds < retryNotBeforeSeconds.current;

      // fixme: hasLocation is initially false,
      //  so it will not be triggered,
      //  but then we have to wait for the next interval,
      //  which is too long.
      if (hasLocation && !isPending && !isWaitingToRetry && (needsInitialization || isOffTrack)) {
        setIsPending(true);

        getRoute(userLocation, destinationCoordinate, via && !hasReachedVia ? [via] : [])
          .then((route) => {
            consecutiveFailureCount.current = 0;
            setIsPending(false);
            setPath(route.paths[0] || null);
            setError(null);
          })
          .catch((error) => {
            consecutiveFailureCount.current += 1;
            retryNotBeforeSeconds.current =
              currentAbsoluteTime().nowSeconds +
              exponentialBackoffSeconds(consecutiveFailureCount.current, firstRetryDelaySeconds, maxRetryDelaySeconds);
            setIsPending(false);
            setError("Could not load route:\n" + error);
          });
      }
    },

    secondsToMillis(routeCheckIntervalSeconds),
    { startOnMount: true, isLeading: true },
  );

  return useMemo(
    () => ({
      path,
      error,
      destinationCoordinate,
      setIsOffTrack: setIsOffTrack,
    }),
    [path, error, destinationCoordinate, setIsOffTrack],
  );
}
