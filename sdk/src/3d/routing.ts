import { useMemo, useState } from "react";
import { GeoCoordinate } from "@/src/shared/GeoLocation";
import { getRoute, Path } from "@/src/shared/Directions";
import { secondsToMillis } from "@/src/shared/math";
import { RouteProps } from "@/src/3d/components/Navigation";
import { useInterval } from "react-timing-hooks";

/// Based on destination and user location, determines the current route.
/// Might fetch a new route when the user moves far enough from the last route.
export function useRouting(userLocation: GeoCoordinate | null, destinationCoordinate: GeoCoordinate): RouteProps {
  const [isOffTrack, setIsOffTrack] = useState<boolean>(true);
  const [path, setPath] = useState<Path | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  // every few seconds, if necessary, request a new route
  useInterval(
    () => {
      const needsInitialization = path === null;
      const hasLocation = userLocation !== null;

      // fixme: hasLocation is initially false,
      //  so it will not be triggered,
      //  but then we have to wait for the next interval,
      //  which is too long.
      if (hasLocation && !isPending && (needsInitialization || isOffTrack)) {
        setIsPending(true);

        getRoute(userLocation, destinationCoordinate)
          .then((route) => {
            setIsPending(false);
            setPath(route.paths[0] || null);
            setError(null);
          })
          .catch((error) => {
            setIsPending(false);
            setError("Could not load route:\n" + error);
          });
      }
    },

    secondsToMillis(1),
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
