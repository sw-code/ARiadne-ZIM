import { renderHook } from "@testing-library/react-native";
import { Vector3 } from "@math.gl/core";
import { measureGuidePace, useNavigationGuide } from "@/src/3d/components/NavigationGuide";
import { computeTransform, Transform } from "@/src/3d/math3d";
import { AbsoluteTime } from "@/src/shared/ReactExtensions";

const groundY = -1.4;

type GuideProps = {
  y: number;
  nextTargetWorld: Vector3 | null;
  camera: Transform;
  viewerVelocity: Vector3;
  time: AbsoluteTime;
};

// without rotation, the camera looks along -Z
function cameraAt(x: number, z: number): Transform {
  return computeTransform({ position: [x, 0, z], rotation: [0, 0, 0] });
}

function guideProps(camera: Transform, nowSeconds: number, viewerVelocity = new Vector3(0, 0, 0)): GuideProps {
  return { y: groundY, nextTargetWorld: null, camera, viewerVelocity, time: { nowSeconds } };
}

describe("useNavigationGuide", () => {
  test("starts in front of the viewer instead of at the AR origin", () => {
    const { result } = renderHook(() => useNavigationGuide(guideProps(cameraAt(20, 30), 0)));

    expect(result.current.position.distance(new Vector3(20, groundY, 27))).toBeLessThan(0.01);
  });

  test("is placed in front of the viewer again after the viewer got far away", () => {
    const { result, rerender } = renderHook((props: GuideProps) => useNavigationGuide(props), {
      initialProps: guideProps(cameraAt(0, 0), 0),
    });

    rerender(guideProps(cameraAt(50, 0), 0.1));

    expect(result.current.position.distance(new Vector3(50, groundY, -3))).toBeLessThan(0.01);
  });

  test("walks after the viewer who moved only a few meters", () => {
    const { result, rerender } = renderHook((props: GuideProps) => useNavigationGuide(props), {
      initialProps: guideProps(cameraAt(0, 0), 0),
    });

    rerender(guideProps(cameraAt(4, 0), 0.1));

    expect(result.current.position.distance(new Vector3(0, groundY, -3))).toBeLessThan(0.1);
  });

  test("keeps its distance ahead of a viewer walking at a normal pace", () => {
    const walkingMetersPerSecond = 1.4;
    const walkingVelocity = new Vector3(0, 0, -walkingMetersPerSecond);
    const framesPerSecond = 30;
    const walkingSeconds = 20;

    const { result, rerender } = renderHook((props: GuideProps) => useNavigationGuide(props), {
      initialProps: guideProps(cameraAt(0, 0), 0, walkingVelocity),
    });

    for (let frame = 1; frame <= walkingSeconds * framesPerSecond; frame++) {
      const seconds = frame / framesPerSecond;
      rerender(guideProps(cameraAt(0, -walkingMetersPerSecond * seconds), seconds, walkingVelocity));
    }

    const guideAheadMeters = -walkingMetersPerSecond * walkingSeconds - result.current.position.z;
    expect(guideAheadMeters).toBeGreaterThan(2);
    expect(guideAheadMeters).toBeLessThan(4);
    expect(result.current.gait).toBe("walking");
  });

  test("keeps standing while the viewer stands and sways the phone", () => {
    const swayMeters = 0.25;
    const swayRadiansPerSecond = 2 * Math.PI * 0.4;
    // as the walking speed estimate sees it, after smoothing
    const swayPeakMetersPerSecond = 0.4;
    const gaits = new Set<string>();

    const { result, rerender } = renderHook((props: GuideProps) => useNavigationGuide(props), {
      initialProps: guideProps(cameraAt(0, 0), 0),
    });

    for (let frame = 1; frame <= 20 * 30; frame++) {
      const seconds = frame / 30;
      const swayVelocity = new Vector3(swayPeakMetersPerSecond * Math.cos(swayRadiansPerSecond * seconds), 0, 0);
      rerender(guideProps(cameraAt(swayMeters * Math.sin(swayRadiansPerSecond * seconds), 0), seconds, swayVelocity));
      gaits.add(result.current.gait);
    }

    expect([...gaits]).toEqual(["standing"]);
  });

  test("walks back to its place after the viewer passed it", () => {
    const { result, rerender } = renderHook((props: GuideProps) => useNavigationGuide(props), {
      initialProps: guideProps(cameraAt(0, 0), 0),
    });

    for (let frame = 1; frame <= 300; frame++) rerender(guideProps(cameraAt(0, -6), frame / 30));

    expect(result.current.position.distance(new Vector3(0, groundY, -9))).toBeLessThan(0.6);
  });
});

describe("measureGuidePace", () => {
  const walkingNorth = { position: new Vector3(0, 0, 0), velocity: new Vector3(0, 0, -1.4) };

  test("measures how far the guide is ahead along the walking direction", () => {
    const guide = { position: new Vector3(1, groundY, -3), velocity: new Vector3(0, 0, -1.2) };

    const pace = measureGuidePace(walkingNorth, guide, new Vector3(0, 0, -1));

    expect(pace.viewerMetersPerSecond).toBeCloseTo(1.4);
    expect(pace.guideMetersPerSecond).toBeCloseTo(1.2);
    expect(pace.guideToViewerMeters).toBeCloseTo(Math.sqrt(10));
    expect(pace.guideAheadMeters).toBeCloseTo(3);
  });

  test("reports a negative distance once the viewer has overtaken the guide", () => {
    const guide = { position: new Vector3(0, groundY, 2), velocity: new Vector3(0, 0, -1) };

    expect(measureGuidePace(walkingNorth, guide, new Vector3(0, 0, -1)).guideAheadMeters).toBeCloseTo(-2);
  });

  test("measures the angle between where the guide leads and where the viewer walks", () => {
    const guide = { position: new Vector3(0, groundY, -3), velocity: new Vector3(0, 0, 0) };
    const leadingEast = new Vector3(1, 0, 0);

    expect(measureGuidePace(walkingNorth, guide, leadingEast).guideToWalkingDegrees).toBeCloseTo(90);
  });

  test("has no walking direction while the viewer stands still", () => {
    const standing = { position: new Vector3(0, 0, 0), velocity: new Vector3(0.1, 0, 0) };
    const guide = { position: new Vector3(0, groundY, -3), velocity: new Vector3(0, 0, 0) };

    const pace = measureGuidePace(standing, guide, new Vector3(0, 0, -1));

    expect(pace.guideAheadMeters).toBeNull();
    expect(pace.guideToWalkingDegrees).toBeNull();
  });
});
