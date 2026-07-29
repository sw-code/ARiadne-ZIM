import { runningMedianDegrees, runningMedianVector3, smoothDegrees, smoothNumber, smoothVector3 } from "../3d/math3d";
import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { millisToSeconds } from "./math";
import { useInterval } from "react-timing-hooks";
import { useDebouncedCallback } from "use-debounce";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "@/src/shared/Logger";
import { Vector3 } from "@math.gl/core";

export function useRefLazy<T>(constructor: () => T): MutableRefObject<T> {
  const valueOrNull = useRef<T | undefined>(undefined);
  if (valueOrNull.current === undefined) valueOrNull.current = constructor();
  if (valueOrNull.current === undefined) throw new Error("Ref constructor returned undefined.");
  return valueOrNull as MutableRefObject<T>;
}

export type Listener<T> = (val: T) => void;
export type Unsubscribe = () => void;

/// Create a hook from a callback function. (Why is this not a builtin react primitive?!)
/// You pass a callback, and how to subscribe, and this function makes sure the listener you provide is subscribed at all times.
/// Since hooks cannot be inside if statements, this offers an activate/deactivate flag.
export function useHookFromCallback<T>(
  active: boolean,
  callback: Listener<T>,
  subscribe: (listener: Listener<T>) => Unsubscribe,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (active) {
      const unsubscribe = subscribe((value) => {
        callbackRef.current(value);
      });

      return unsubscribe;
    } else {
      return undefined;
    }
  }, [active, subscribe]);
}

export type DeltaTime = { seconds: number };
export type AbsoluteTime = { nowSeconds: number };

export function currentAbsoluteTime(): AbsoluteTime {
  return { nowSeconds: millisToSeconds(Date.now()) };
}

/// Applies a smoothing similar to a css transition.
export function useTimeSmoothingDegrees(currentTarget: number, speed: number, time: AbsoluteTime): number {
  return useTimeSmoothing(currentTarget, speed, smoothDegrees, time);
}

/// Applies a smoothing similar to a css transition.
export function useTimeSmoothingNumber(currentTarget: number, speed: number, time: AbsoluteTime): number {
  return useTimeSmoothing(currentTarget, speed, smoothNumber, time);
}

/// Applies a smoothing similar to a css transition.
export function useTimeSmoothingVector(currentTarget: Vector3, speed: number, time: AbsoluteTime): Vector3 {
  return useTimeSmoothing(currentTarget, speed, smoothVector3, time);
}

export type SmoothingFunction<T> = (current: T, target: T, speed: number, deltaSeconds: number) => T;

export function useTimeSmoothing<T>(
  target: T,
  speed: number,
  smoother: SmoothingFunction<T>,
  time: AbsoluteTime,
  initial?: T,
): T {
  return useTimeReducer(time, initial ?? target, (current, deltaTime) =>
    smoother(current, target, speed, deltaTime.seconds),
  );
}

export function useTimeReducer<T>(time: AbsoluteTime, initial: T, update: (state: T, time: DeltaTime) => T): T {
  const [current, setCurrent] = useState<T>(initial);

  const updateOnTime = (deltaTime: DeltaTime) => {
    const newVal = update(current, deltaTime);
    setCurrent(newVal);
  };

  useTimeEffect(time, updateOnTime);
  return current;
}

/// Diagnostic: logs how many times the component rendered during the last wall-clock second.
/// A healthy per-frame component sits near the frame rate (~60); a render loop shows hundreds or
/// thousands. Remove once the loop is located.
export function useRenderRateLog(label: string): void {
  const rendersSinceLastLog = useRef(0);
  rendersSinceLastLog.current++;

  useEffect(() => {
    if (!__DEV__ || __DEV__) return;

    const intervalId = setInterval(() => {
      log.info("RENDER RATE", { label, rendersPerSecond: rendersSinceLastLog.current });
      rendersSinceLastLog.current = 0;
    }, 1000);
    return () => clearInterval(intervalId);
  }, [label]);
}

export function useTimeThrottling<T>(currentValue: T, intervalSeconds: number, currentTime: AbsoluteTime): T {
  return useTimeInterval(intervalSeconds, currentTime, () => currentValue);
}

export function useTimeInterval<T>(
  intervalSeconds: number,
  currentTime: AbsoluteTime,
  compute: (t: AbsoluteTime) => T,
): T {
  const [throttled, setThrottled] = useState(compute(currentTime));
  const lastUpdate = useRef(currentTime.nowSeconds);

  const update = () => {
    if (lastUpdate.current + intervalSeconds < currentTime.nowSeconds) {
      lastUpdate.current = currentTime.nowSeconds;
      setThrottled(compute(currentTime));
    }
  };

  useTimeEffect(currentTime, update);
  return throttled;
}

/// Runs the effect once per interval. Unlike with useTimeInterval, nothing runs on the renders in between.
export function useTimeIntervalEffect(intervalSeconds: number, time: AbsoluteTime, effect: Listener<AbsoluteTime>) {
  const lastRunAtSeconds = useRef(time.nowSeconds);

  useTimeEffect(time, () => {
    if (time.nowSeconds - lastRunAtSeconds.current < intervalSeconds) return;
    lastRunAtSeconds.current = time.nowSeconds;
    effect(time);
  });
}

export function useTimeEffect(time: AbsoluteTime, update: Listener<DeltaTime>) {
  // important: this also flattens the object, doing useMemo automatically
  const nowSeconds = time.nowSeconds;
  const lastUpdatedAt = useRef(nowSeconds);

  const updateFn = useRef(update);
  updateFn.current = update;

  useEffect(() => {
    const delta = nowSeconds - lastUpdatedAt.current;

    if (delta > 0.00001) {
      lastUpdatedAt.current = nowSeconds;
      updateFn.current({ seconds: delta });
    }
  }, [nowSeconds]);
}

export function useIntervalAsync<T>(
  asyncTask: () => Promise<T>,
  intervalMs: number,
  retriggerDeps: unknown[] = [],
): [T | undefined, any | null] {
  const [result, setResult] = useState<T | undefined>();
  const [error, setError] = useState<any | null>(null);

  const pending = useRef<Promise<T> | null>(null);

  const asyncTaskRef = useRef(asyncTask);
  asyncTaskRef.current = asyncTask;

  const runTask = useCallback(() => {
    if (!pending.current) {
      const promise = asyncTaskRef.current();
      pending.current = promise;
      promise
        .then((result) => {
          setResult(result);
          setError(null);
        })
        .catch((error) => {
          setResult(undefined);
          setError("" + error);
          log.warn("Error:", error);
        })
        .finally(() => {
          pending.current = null;
        });
    }
  }, []);

  useInterval(runTask, intervalMs, { startOnMount: true });

  // this also triggers initially
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => runTask(), retriggerDeps);

  return [result, error] as const;
}

export function useDeltaTime(time: AbsoluteTime): DeltaTime {
  const lastUpdateAtSeconds = useRef(time.nowSeconds);
  const delta = useRef(0);

  useEffect(() => {
    delta.current = time.nowSeconds - lastUpdateAtSeconds.current;
    lastUpdateAtSeconds.current = time.nowSeconds;
  }, [time.nowSeconds]);

  return { seconds: delta.current };
}

export function usePreviousInstanceIfEq<T>(newValue: T, eq: (a: T, b: T) => boolean): T {
  const ref = useRef<T>(newValue);

  const isEq = eq(ref.current, newValue);
  if (!isEq) ref.current = newValue;

  return ref.current;
}

/// Samples once every time the current value changes (in identity).
export function useContinuousMedianVector(
  currentValue: Vector3,
  intervalSeconds: number,
  count: number,
  time: AbsoluteTime,
): Vector3 {
  const median = useRef(runningMedianVector3(count));

  useTimeInterval(intervalSeconds, time, () => {
    median.current.update(currentValue);
  });

  return median.current.value() ?? currentValue;
}

/// Samples once every time the current value changes (as a number).
export function useContinuousMedianDegrees(
  currentValue: number,
  intervalSeconds: number,
  count: number,
  time: AbsoluteTime,
): number {
  const median = useRef(runningMedianDegrees(count));

  useTimeInterval(intervalSeconds, time, () => {
    median.current.update(currentValue);
  });

  return median.current.value() ?? currentValue;
}

export function isWithinPointGranularity(a: Vector3, b: Vector3, granularity: number): boolean {
  const requiredSqDistance = granularity * granularity;
  return a.distanceToSquared(b) < requiredSqDistance;
}

export function usePointGranularity(point: Vector3, granularity: number): Vector3 {
  const isEqual = (a: Vector3, b: Vector3) => isWithinPointGranularity(a, b, granularity);
  return usePreviousInstanceIfEq(point, isEqual);
}

// Long enough to coalesce bursts of writes (e.g. dwell time flushed several times a second while
// the user gazes at a location) into a single storage write, short enough that a value is safely
// stored well before the user can navigate away.
const PERSIST_DEBOUNCE_MILLIS = 500;

/// A useState whose value survives app restarts by mirroring it to on-device storage.
/// Renders computeDefault() immediately, then replaces it once the stored value has loaded, so there
/// is never a blank state. Writes are debounced and suppressed until that initial load completes, so
/// a freshly-mounted default can never overwrite previously stored data before it arrives (the
/// classic hydration race). reviveLoaded lets the caller reconcile a stored value with newer defaults.
export function usePersistentState<Value>(
  storageKey: string,
  computeDefault: () => Value,
  reviveLoaded: (loaded: Value) => Value = (loaded) => loaded,
): readonly [Value, Dispatch<SetStateAction<Value>>, boolean] {
  const [value, setValue] = useState<Value>(computeDefault);
  const [isLoaded, setIsLoaded] = useState(false);

  // Tracks whether the caller has already changed the value. If so, that change wins over the
  // arriving stored value (guards the reverse hydration race). Automatic early callers count as a
  // dispatch too, which is fine: on-device storage resolves well before any network-driven update.
  const hasDispatched = useRef(false);
  const dispatch = useCallback<Dispatch<SetStateAction<Value>>>((action) => {
    hasDispatched.current = true;
    setValue(action);
  }, []);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        // The internal setValue (not `dispatch`) keeps this load from counting as a user dispatch.
        if (isMounted && stored !== null && !hasDispatched.current) {
          setValue(reviveLoaded(JSON.parse(stored) as Value));
        }
      })
      .catch((error) => log.warn(`Could not load persisted state "${storageKey}":`, error))
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });
    return () => {
      isMounted = false;
    };
    // computeDefault/reviveLoaded are intentionally captured once, on the mounting render only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // The key is passed in (not closed over) so a flushed write always targets the key it was queued
  // for, even if storageKey has since changed.
  const persist = useDebouncedCallback((key: string, valueToStore: Value) => {
    AsyncStorage.setItem(key, JSON.stringify(valueToStore)).catch((error) =>
      log.warn(`Could not persist state "${key}":`, error),
    );
  }, PERSIST_DEBOUNCE_MILLIS);

  useEffect(() => {
    if (isLoaded) persist(storageKey, value);
  }, [value, isLoaded, persist, storageKey]);

  // Flush a pending debounced write on unmount, and before the key changes, so the last update is
  // never dropped inside the debounce window.
  useEffect(() => () => persist.flush(), [persist, storageKey]);

  return [value, dispatch, isLoaded] as const;
}
