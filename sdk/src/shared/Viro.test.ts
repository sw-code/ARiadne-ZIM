import { act, renderHook } from "@testing-library/react-native";
import { ViroAnchor } from "@reactvision/react-viro";
import { useAnchorsState } from "@/src/shared/Viro";

function plane(anchorId: string, width = 1): ViroAnchor {
  return { anchorId, type: "plane", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], width };
}

function renderAnchorsStateWith(anchorIds: string[]) {
  const rendered = renderHook(() => useAnchorsState());
  anchorIds.forEach((anchorId) => act(() => rendered.result.current.onAnchorFound(plane(anchorId))));
  return rendered;
}

// ARCore reports anchor changes in bursts, e.g. many plane removals after relocalization
describe("useAnchorsState", () => {
  test("keeps all anchors found in one batch", () => {
    const { result } = renderAnchorsStateWith([]);

    act(() => {
      result.current.onAnchorFound(plane("a"));
      result.current.onAnchorFound(plane("b"));
    });

    expect(Object.keys(result.current.anchors).sort()).toEqual(["a", "b"]);
  });

  test("removes all anchors removed in one batch", () => {
    const { result } = renderAnchorsStateWith(["a", "b", "c"]);

    act(() => {
      result.current.onAnchorRemoved(plane("a"));
      result.current.onAnchorRemoved(plane("b"));
    });

    expect(Object.keys(result.current.anchors)).toEqual(["c"]);
  });

  test("applies all anchor updates of one batch", () => {
    const { result } = renderAnchorsStateWith(["a", "b"]);

    act(() => {
      result.current.onAnchorUpdated(plane("a", 5));
      result.current.onAnchorUpdated(plane("b", 7));
    });

    expect(result.current.anchors["a"]?.width).toBe(5);
    expect(result.current.anchors["b"]?.width).toBe(7);
  });
});
