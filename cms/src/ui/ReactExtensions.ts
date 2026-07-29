import { useEffect, useState } from "react";

export type Loadable<Value> =
  { status: "loading" } | { status: "loaded"; value: Value } | { status: "failed"; error: unknown };

// `load` must keep its identity between renders, or it runs again after every one. While reloading, the previous value
// stays in place, so the page does not flash empty.
export function useLoadable<Value>(load: () => Promise<Value>): { loadable: Loadable<Value>; reload: () => void } {
  const [loadable, setLoadable] = useState<Loadable<Value>>({ status: "loading" });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let isOutdated = false;
    load().then(
      (value) => {
        if (!isOutdated) setLoadable({ status: "loaded", value });
      },
      (error) => {
        if (!isOutdated) setLoadable({ status: "failed", error });
      },
    );
    return () => {
      isOutdated = true;
    };
  }, [load, reloadCount]);

  return { loadable, reload: () => setReloadCount((count) => count + 1) };
}
