import { jest } from "@jest/globals";
import { renderHook, act, cleanup, render } from "@testing-library/react-native";
import {
  useTimeEffect,
  DeltaTime,
  useTimeReducer,
  AbsoluteTime,
  useDeltaTime,
  useContinuousMedianVector,
  useContinuousMedianDegrees,
  useTimeIntervalEffect,
  isWithinPointGranularity,
  usePointGranularity,
  usePersistentState,
  useLatest,
} from "@/src/shared/ReactExtensions";
import { Vector3 } from "@math.gl/core";
import { useRef } from "react";
import { Text } from "react-native";
import { toBeDeepCloseTo, toMatchCloseTo } from "jest-matcher-deep-close-to";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { promiseWithResolvers } from "@/src/shared/JavascriptExtensions";
expect.extend({ toBeDeepCloseTo, toMatchCloseTo });

const renderTimeEffectHook = (initialNowSeconds: number, initialUpdate: (nowSeconds: DeltaTime) => void) =>
  renderHook(
    ({ nowSeconds, update }: { nowSeconds: number; update: (nowSeconds: DeltaTime) => void }) =>
      useTimeEffect({ nowSeconds }, update),
    {
      initialProps: { nowSeconds: initialNowSeconds, update: initialUpdate },
    },
  );

describe("useDeltaTimeEffect", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  test("does not call update once initially with delta=0", () => {
    const onUpdate = jest.fn();
    renderTimeEffectHook(1.0, onUpdate);
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("calls update with correct delta when time increases", async () => {
    const onUpdate = jest.fn();
    const { rerender } = renderTimeEffectHook(1.0, onUpdate);

    await act(async () => {
      rerender({ nowSeconds: 1.016, update: onUpdate });
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const arg = onUpdate.mock.calls[0]?.[0] as DeltaTime;
    expect(arg.seconds).toBeCloseTo(0.016, 6);
  });

  test.each([
    ["time stays the same", 5.0, 5.0],
    ["tiny delta below threshold", 10.0, 10.0 + 0.000001],
    ["time goes backwards", 20.0, 19.5],
  ])("does not call update when %s", async (_label, start, next) => {
    const onUpdate = jest.fn();
    const { rerender } = renderTimeEffectHook(start, onUpdate);

    await act(async () => {
      rerender({ nowSeconds: next, update: onUpdate });
    });

    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("does not call update again if time stays the same even when update callback changes", async () => {
    const onUpdate1 = jest.fn();
    const onUpdate2 = jest.fn();

    const { rerender } = renderTimeEffectHook(5.0, onUpdate1);

    await act(async () => {
      // Rerender with SAME time but a different callback instance
      rerender({ nowSeconds: 5.0, update: onUpdate2 });
    });

    expect(onUpdate1).toHaveBeenCalledTimes(0);
    expect(onUpdate2).toHaveBeenCalledTimes(0);
  });
});

describe("ReducerState", () => {
  test("measures time", async () => {
    const { rerender, result } = renderHook(
      ({ nowSeconds }: { nowSeconds: number }) => {
        return useTimeReducer({ nowSeconds }, 0, (totalTime: number, delta: DeltaTime) => totalTime + delta.seconds);
      },
      {
        initialProps: { nowSeconds: 10.0 },
      },
    );

    await act(async () => {
      rerender({ nowSeconds: 14.0 });
    });

    await act(async () => {
      rerender({ nowSeconds: 15.0 });
    });

    expect(result.current).toBeCloseTo(5);
  });

  test("renders few times", async () => {
    const { rerender, result } = renderHook(
      ({ nowSeconds }: { nowSeconds: number }) => {
        return useTimeReducer({ nowSeconds }, 0, (invocations: number) => invocations + 1);
      },
      {
        initialProps: { nowSeconds: 10.0 },
      },
    );

    await act(async () => {
      rerender({ nowSeconds: 10.0 });
    });

    expect(result.current).toBe(0);

    await act(async () => {
      rerender({ nowSeconds: 14.0 });
    });

    expect(result.current).toBe(1);

    await act(async () => {
      rerender({ nowSeconds: 15.0 });
    });

    expect(result.current).toBe(2);

    await act(async () => {
      rerender({ nowSeconds: 15.0 });
    });

    await act(async () => {
      rerender({ nowSeconds: 14.0 });
    });

    expect(result.current).toBe(2);
  });

  function StopwatchComponent({ time }: { time: AbsoluteTime }): React.ReactElement {
    const totalSeconds = useTimeReducer(time, 0, (totalSeconds, delta) => totalSeconds + delta.seconds);
    const renderCount = useRef(0);
    renderCount.current++;

    return (
      <>
        <Text testID={"totalTime"}>{totalSeconds.toFixed(2)}</Text>
        <Text testID={"renderCount"}>{renderCount.current}</Text>
      </>
    );
  }

  test("stopwatch renders minimum amount of times", async () => {
    const fakeUi = render(<StopwatchComponent time={{ nowSeconds: 14.0 }} />);
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("1");

    // note: in development builds, react invokes the rendering function twice.
    // therefore this will result in a change.
    await act(async () => {
      fakeUi.rerender(<StopwatchComponent time={{ nowSeconds: 14.0 }} />);
    });
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("2");

    await act(async () => {
      fakeUi.rerender(<StopwatchComponent time={{ nowSeconds: 15.0 }} />);
    });
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("1.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("4");

    await act(async () => {
      fakeUi.rerender(<StopwatchComponent time={{ nowSeconds: 15.0 }} />);
    });
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("1.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("5");

    await act(async () => {
      fakeUi.rerender(<StopwatchComponent time={{ nowSeconds: 25.0 }} />);
    });
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("11.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("7");
  });
});

const renderDeltaTimeHook = (initialNowSeconds: number) =>
  renderHook(({ nowSeconds }: { nowSeconds: number }) => useDeltaTime({ nowSeconds }), {
    initialProps: { nowSeconds: initialNowSeconds },
  });

describe("useDeltaTime", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  // Note: useDeltaTime calculates delta in useEffect (after render), so the returned
  // delta reflects the PREVIOUS time change, observable on the NEXT render.

  test("returns zero delta on initial render", () => {
    const { result } = renderDeltaTimeHook(5.0);
    expect(result.current.seconds).toBe(0);
  });

  test("returns correct delta after time progresses (observable on next render)", async () => {
    const { rerender, result } = renderDeltaTimeHook(1.0);

    await act(async () => {
      rerender({ nowSeconds: 1.5 });
    });
    expect(result.current.seconds).toBe(0);

    await act(async () => {
      rerender({ nowSeconds: 1.5 });
    });
    expect(result.current.seconds).toBeCloseTo(0.5, 6);
  });

  test("preserves last delta when time stays the same (effect only runs on time change)", async () => {
    const { rerender, result } = renderDeltaTimeHook(10.0);

    await act(async () => {
      rerender({ nowSeconds: 11.0 });
    });
    expect(result.current.seconds).toBe(0);

    await act(async () => {
      rerender({ nowSeconds: 11.0 });
    });
    expect(result.current.seconds).toBeCloseTo(1.0, 6);

    await act(async () => {
      rerender({ nowSeconds: 11.0 });
    });
    expect(result.current.seconds).toBeCloseTo(1.0, 6);
  });

  test("tracks consecutive time changes correctly", async () => {
    const { rerender, result } = renderDeltaTimeHook(0.0);

    await act(async () => {
      rerender({ nowSeconds: 0.016 });
    });
    expect(result.current.seconds).toBe(0); // Not yet visible

    await act(async () => {
      rerender({ nowSeconds: 0.033 });
    });
    expect(result.current.seconds).toBeCloseTo(0.016, 6);

    await act(async () => {
      rerender({ nowSeconds: 0.05 });
    });
    expect(result.current.seconds).toBeCloseTo(0.017, 3);

    await act(async () => {
      rerender({ nowSeconds: 0.05 });
    });
    expect(result.current.seconds).toBeCloseTo(0.017, 3);
  });

  test("handles negative delta when time goes backwards", async () => {
    const { rerender, result } = renderDeltaTimeHook(10.0);

    await act(async () => {
      rerender({ nowSeconds: 9.0 });
    });
    expect(result.current.seconds).toBe(0);

    await act(async () => {
      rerender({ nowSeconds: 9.0 });
    });
    expect(result.current.seconds).toBeCloseTo(-1.0, 6);
  });

  function AnimationComponent({ time }: { time: AbsoluteTime }): React.ReactElement {
    const deltaTime = useDeltaTime(time);
    const totalSeconds = useRef(0);
    const renderCount = useRef(0);

    totalSeconds.current += deltaTime.seconds;
    renderCount.current++;

    return (
      <>
        <Text testID={"deltaTime"}>{deltaTime.seconds.toFixed(3)}</Text>
        <Text testID={"totalTime"}>{totalSeconds.current.toFixed(2)}</Text>
        <Text testID={"renderCount"}>{renderCount.current}</Text>
      </>
    );
  }

  test("integrates with component rendering for animation use case", async () => {
    const fakeUi = render(<AnimationComponent time={{ nowSeconds: 0.0 }} />);

    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.000");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.00");
    expect(fakeUi.getByTestId("renderCount")).toHaveTextContent("1");

    await act(async () => {
      fakeUi.rerender(<AnimationComponent time={{ nowSeconds: 0.016 }} />);
    });
    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.000");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.00");

    await act(async () => {
      fakeUi.rerender(<AnimationComponent time={{ nowSeconds: 0.033 }} />);
    });
    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.016");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.02");

    await act(async () => {
      fakeUi.rerender(<AnimationComponent time={{ nowSeconds: 0.05 }} />);
    });
    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.017");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.03");

    await act(async () => {
      fakeUi.rerender(<AnimationComponent time={{ nowSeconds: 0.05 }} />);
    });
    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.017");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.05");

    await act(async () => {
      fakeUi.rerender(<AnimationComponent time={{ nowSeconds: 0.066 }} />);
    });
    expect(fakeUi.getByTestId("deltaTime")).toHaveTextContent("0.017");
    expect(fakeUi.getByTestId("totalTime")).toHaveTextContent("0.07");
  });
});

test("useTimeIntervalEffect runs once per interval, not on every frame", () => {
  const effect = jest.fn();
  const { rerender } = renderHook(
    ({ nowSeconds }: { nowSeconds: number }) => useTimeIntervalEffect(1, { nowSeconds }, effect),
    { initialProps: { nowSeconds: 0 } },
  );

  for (let frame = 1; frame <= 75; frame++) rerender({ nowSeconds: frame / 30 });

  expect(effect).toHaveBeenCalledTimes(2);
});

// Each rerender advances nowSeconds by 2 (interval=1), which triggers a new sample.
// Rerendering with the same nowSeconds skips the effect and lets us observe the median.
describe("useContinuousMedianVector", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  test("returns initial value on first render", () => {
    const initial = new Vector3(7, 8, 9);
    const { result } = renderHook(() => useContinuousMedianVector(initial, 1, 5, { nowSeconds: 0 }));
    expect(result.current).toBeDeepCloseTo([7, 8, 9]);
  });

  test("samples value at each interval", async () => {
    const v0 = new Vector3(3, 4, 5);
    const v1 = new Vector3(3, 4, 5);
    const { result, rerender } = renderHook(
      ({ v, nowSeconds }: { v: Vector3; nowSeconds: number }) => useContinuousMedianVector(v, 1, 10, { nowSeconds }),
      { initialProps: { v: v0, nowSeconds: 0 } },
    );

    await act(async () => rerender({ v: v1, nowSeconds: 2 }));
    expect(result.current).toBeDeepCloseTo([3, 4, 5]);
  });

  test("picks the sample with minimum total distance to others", async () => {
    const v0 = new Vector3(0, 0, 0);
    const v1 = new Vector3(1, 0, 0);
    const v2 = new Vector3(100, 0, 0);

    const { result, rerender } = renderHook(
      ({ v, nowSeconds }: { v: Vector3; nowSeconds: number }) => useContinuousMedianVector(v, 1, 10, { nowSeconds }),
      { initialProps: { v: v0, nowSeconds: 0 } },
    );

    await act(async () => rerender({ v: v1, nowSeconds: 2 }));
    await act(async () => rerender({ v: v2, nowSeconds: 4 }));

    // median([(0,0,0), (1,0,0), (100,0,0)]):
    //   (0,0,0) total dist = 1 + 100 = 101
    //   (1,0,0) total dist = 1 + 99  = 100  ← minimum
    //   (100,0,0) total dist = 100 + 99 = 199
    expect(result.current).toBeDeepCloseTo([1, 0, 0]);
  });

  test("filters outlier from consistent cluster", async () => {
    const { result, rerender } = renderHook(
      ({ v, nowSeconds }: { v: Vector3; nowSeconds: number }) => useContinuousMedianVector(v, 1, 10, { nowSeconds }),
      { initialProps: { v: new Vector3(10, 0, 0), nowSeconds: 0 } },
    );

    await act(async () => rerender({ v: new Vector3(11, 0, 0), nowSeconds: 2 }));
    await act(async () => rerender({ v: new Vector3(10.5, 0, 0), nowSeconds: 4 }));
    await act(async () => rerender({ v: new Vector3(500, 0, 0), nowSeconds: 6 })); // outlier

    // The outlier at 500 has the largest total distance.
    // The median stays in the cluster near x=10.
    expect(result.current.x).toBeGreaterThan(9);
    expect(result.current.x).toBeLessThan(15);
  });

  test("works with 3D vectors", async () => {
    const v0 = new Vector3(1, 2, 3);
    const v1 = new Vector3(1.1, 2.1, 3.1);
    const v2 = new Vector3(100, 200, 300); // outlier

    const { result, rerender } = renderHook(
      ({ v, nowSeconds }: { v: Vector3; nowSeconds: number }) => useContinuousMedianVector(v, 1, 10, { nowSeconds }),
      { initialProps: { v: v0, nowSeconds: 0 } },
    );

    await act(async () => rerender({ v: v1, nowSeconds: 2 }));
    await act(async () => rerender({ v: v2, nowSeconds: 4 }));

    // The two cluster points are close; the outlier is far.
    // Median is one of the cluster points.
    expect(result.current.distanceTo(new Vector3(1, 2, 3))).toBeLessThan(1);
  });
});

// Each rerender advances nowSeconds by 2 (interval=1), which triggers a new sample.
describe("useContinuousMedianDegrees", () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  test("returns initial value on first render", () => {
    const { result } = renderHook(() => useContinuousMedianDegrees(350, 1, 5, { nowSeconds: 0 }));
    expect(result.current).toBeCloseTo(350);
  });

  test("correctly finds median with duplicates", async () => {
    const { result, rerender } = renderHook(
      ({ d, nowSeconds }: { d: number; nowSeconds: number }) => useContinuousMedianDegrees(d, 1, 20, { nowSeconds }),
      { initialProps: { d: 1001, nowSeconds: 0 } },
    );

    await act(async () => rerender({ d: 90, nowSeconds: 2 }));
    await act(async () => rerender({ d: 90, nowSeconds: 4 }));
    await act(async () => rerender({ d: 90, nowSeconds: 6 }));
    await act(async () => rerender({ d: 90, nowSeconds: 8 }));
    await act(async () => rerender({ d: 90, nowSeconds: 10 }));
    await act(async () => rerender({ d: 90, nowSeconds: 12 }));
    await act(async () => rerender({ d: 90, nowSeconds: 14 }));
    await act(async () => rerender({ d: 1000, nowSeconds: 16 }));
    await act(async () => rerender({ d: 1, nowSeconds: 18 }));

    expect(result.current).toBe(90);
  });

  test("returns approximate degree for consistent samples", async () => {
    const { result, rerender } = renderHook(
      ({ d, nowSeconds }: { d: number; nowSeconds: number }) => useContinuousMedianDegrees(d, 1, 10, { nowSeconds }),
      { initialProps: { d: 90, nowSeconds: 0 } },
    );

    await act(async () => rerender({ d: 91, nowSeconds: 2 }));
    await act(async () => rerender({ d: 89, nowSeconds: 4 }));

    // median of degrees [90, 91, 89] picks one of those values — all within 1° of 90
    expect(result.current).toBeGreaterThan(88);
    expect(result.current).toBeLessThan(92);
  });

  test("handles wrapping around 0/360 boundary", async () => {
    const { result, rerender } = renderHook(
      ({ d, nowSeconds }: { d: number; nowSeconds: number }) => useContinuousMedianDegrees(d, 1, 10, { nowSeconds }),
      { initialProps: { d: 350, nowSeconds: 0 } },
    );

    await act(async () => rerender({ d: 355, nowSeconds: 2 }));
    await act(async () => rerender({ d: 5, nowSeconds: 4 }));

    // The vector-based median picks a direction near 0/360°,
    // unlike a naive average of (350+355+5)/3 ≈ 236.7°.
    const nearZero = result.current > 340 || result.current < 20;
    expect(nearZero).toBe(true);
  });

  test("filters outlier degree", async () => {
    const { result, rerender } = renderHook(
      ({ d, nowSeconds }: { d: number; nowSeconds: number }) => useContinuousMedianDegrees(d, 1, 10, { nowSeconds }),
      { initialProps: { d: 45, nowSeconds: 0 } },
    );

    await act(async () => rerender({ d: 46, nowSeconds: 2 }));
    await act(async () => rerender({ d: 44, nowSeconds: 4 }));
    await act(async () => rerender({ d: 225, nowSeconds: 6 })); // outlier (opposite direction)

    // Three cluster values near 45° outweigh the outlier at 225°.
    expect(result.current).toBeCloseTo(45, 0);
  });
});

describe("isWithinPointGranularity", () => {
  test("returns true when points are identical", () => {
    const a = new Vector3(1, 2, 3);
    expect(isWithinPointGranularity(a, a, 0.1)).toBe(true);
  });

  test("returns true when distance is less than granularity", () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(0.05, 0, 0);
    expect(isWithinPointGranularity(a, b, 0.1)).toBe(true);
  });

  test("returns false when distance equals granularity (exclusive boundary)", () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(0.1, 0, 0);
    expect(isWithinPointGranularity(a, b, 0.1)).toBe(false);
  });

  test("returns false when distance exceeds granularity", () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(1, 0, 0);
    expect(isWithinPointGranularity(a, b, 0.1)).toBe(false);
  });
});

describe("usePointGranularity", () => {
  afterEach(() => cleanup());

  test("returns the initial point on first render", () => {
    const point = new Vector3(1, 2, 3);
    const { result } = renderPointGranularityHook(point, 0.1);

    expect(result.current).toBe(point);
  });

  test("keeps the previous instance when the new point is within granularity", async () => {
    const initial = new Vector3(0, 0, 0);
    const { result, moveTo } = renderPointGranularityHook(initial, 0.1);
    await moveTo(new Vector3(0.05, 0, 0));

    expect(result.current).toBe(initial);
  });

  test("updates to the new instance when the new point exceeds granularity", async () => {
    const initial = new Vector3(0, 0, 0);
    const { result, moveTo } = renderPointGranularityHook(initial, 0.1);
    const far = new Vector3(1, 0, 0);
    await moveTo(far);

    expect(result.current).toBe(far);
  });

  function renderPointGranularityHook(initialPoint: Vector3, granularity: number) {
    const hook = renderHook(({ p }: { p: Vector3 }) => usePointGranularity(p, granularity), {
      initialProps: { p: initialPoint },
    });

    return {
      result: hook.result,
      moveTo: async (point: Vector3) => act(async () => hook.rerender({ p: point })),
    };
  }
});

describe("usePersistentState", () => {
  afterEach(async () => {
    cleanup();
    jest.restoreAllMocks();
    jest.useRealTimers();
    await AsyncStorage.clear();
  });

  test("an update dispatched before the load resolves is not clobbered by the stored value", async () => {
    // Control exactly when the load resolves, so we can dispatch an update while it is still pending.
    const load = promiseWithResolvers<string | null>();
    jest.spyOn(AsyncStorage, "getItem").mockReturnValueOnce(load.promise);

    const { result } = renderHook(() => usePersistentState("race.key", () => "seed"));

    act(() => result.current[1]("user-edit"));

    await act(async () => {
      load.resolve(JSON.stringify("stored"));
      await load.promise;
    });

    expect(result.current[0]).toBe("user-edit");
  });

  test("flushes a pending debounced write on unmount", async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(AsyncStorage, "setItem");

    const { result, unmount } = renderHook(() => usePersistentState("flush.key", () => "seed"));
    await act(async () => {}); // let the initial load settle so writes are enabled

    act(() => result.current[1]("latest")); // queues a debounced write that has not fired yet
    setItem.mockClear();

    unmount(); // cleanup must flush the pending write rather than drop it

    expect(setItem).toHaveBeenCalledWith("flush.key", JSON.stringify("latest"));
  });
});

describe("useLatest", () => {
  test("is one ref holding the value of the latest render", () => {
    const { result, rerender } = renderHook(({ value }: { value: string }) => useLatest(value), {
      initialProps: { value: "first" },
    });
    const firstRef = result.current;

    rerender({ value: "second" });

    expect(result.current).toBe(firstRef);
    expect(firstRef.current).toBe("second");
  });
});
