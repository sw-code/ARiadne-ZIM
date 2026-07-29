import { renderHook } from "@testing-library/react-native";
import {
  chooseNavigationAudioMode,
  groundHeadingAlignment,
  guideLeadDirection,
  instructionsByCoord,
  useNavigationState,
  navigationSoundFor,
} from "@/src/3d/navigation";
import { Vector3 } from "@math.gl/core";
import { IndexedPolygon } from "@/src/3d/navigation";
import { Instruction } from "@/src/shared/Directions";
import { toBeDeepCloseTo, toMatchCloseTo } from "jest-matcher-deep-close-to";
expect.extend({ toBeDeepCloseTo, toMatchCloseTo });

it("shows the next instruction", () => {
  const initialUser = x(1);

  const [p0, p1, p2] = [x(2), x(3), x(4)];

  const destination = x(5);
  const path = [p0, p1, p2];

  const [instr0] = [newInstruction("go forward", [1, 1])];
  const instructions = [instr0];

  const { result, rerender } = renderHook(
    ({ user }: { user: Vector3 }) => useNavigationState(user, path, instructions, destination),
    {
      initialProps: { user: initialUser },
    },
  );

  expect(result.current.currentInstruction).toEqual(instr0);
  expect(result.current.closestPointOnRoute).toBeDeepCloseTo(x(2));

  rerender({ user: new Vector3(2.51, 1, -1) });
  expect(result.current.closestPointOnRoute).toBeDeepCloseTo(new Vector3(2.51, 0, 0));
});

it("finds instruction for coord", () => {
  const [a, b, c, d] = [
    newInstruction("a", [4, 5]),
    newInstruction("b", [7, 9]),
    newInstruction("c", [20, 22]),
    newInstruction("d", [30, 30]),
  ];

  const instructions = [a, b, c, d];
  const instrByCoord = instructionsByCoord(50, instructions);

  expect(instrByCoord[0]?.nextInstruction).toBe(a);
  expect(instrByCoord[4]?.nextInstruction).toBe(a);
  expect(instrByCoord[5]?.nextInstruction).toBe(a);
  expect(instrByCoord[6]?.nextInstruction).toBe(b);
  expect(instrByCoord[8]?.nextInstruction).toBe(b);
  expect(instrByCoord[9]?.nextInstruction).toBe(b);
  expect(instrByCoord[10]?.nextInstruction).toBe(c);
  expect(instrByCoord[21]?.nextInstruction).toBe(c);
  expect(instrByCoord[23]?.nextInstruction).toBe(d);
  expect(instrByCoord[40]?.nextInstruction).toBe(null);
});

describe("instructionsByCoord complex scenarios", () => {
  it("handles empty instructions array", () => {
    const instrByCoord = instructionsByCoord(10, []);

    // All coordinates should have null as next instruction
    for (let i = 0; i < 10; i++) {
      expect(instrByCoord[i]?.nextInstruction).toBe(null);
    }
  });

  it("handles single instruction covering entire route", () => {
    const instruction = newInstruction("go straight", [0, 99]);
    const instrByCoord = instructionsByCoord(100, [instruction]);

    // All coordinates should have the same instruction until it ends
    expect(instrByCoord[0]?.nextInstruction).toBe(instruction);
    expect(instrByCoord[50]?.nextInstruction).toBe(instruction);
    expect(instrByCoord[99]?.nextInstruction).toBe(instruction);
    // After the instruction ends, should be null
    expect(instrByCoord[100]).toBeUndefined(); // Out of bounds in our array
  });

  it("handles consecutive instructions without gaps", () => {
    const [a, b, c, d, e] = [
      newInstruction("start", [0, 9]),
      newInstruction("turn left", [10, 19]),
      newInstruction("continue", [20, 29]),
      newInstruction("turn right", [30, 39]),
      newInstruction("arrive", [40, 49]),
    ];

    const instructions = [a, b, c, d, e];
    const instrByCoord = instructionsByCoord(60, instructions);

    // Verify each instruction is active during its interval
    expect(instrByCoord[0]?.nextInstruction).toBe(a);
    expect(instrByCoord[9]?.nextInstruction).toBe(a);
    expect(instrByCoord[10]?.nextInstruction).toBe(b);
    expect(instrByCoord[19]?.nextInstruction).toBe(b);
    expect(instrByCoord[20]?.nextInstruction).toBe(c);
    expect(instrByCoord[29]?.nextInstruction).toBe(c);
    expect(instrByCoord[30]?.nextInstruction).toBe(d);
    expect(instrByCoord[39]?.nextInstruction).toBe(d);
    expect(instrByCoord[40]?.nextInstruction).toBe(e);
    expect(instrByCoord[49]?.nextInstruction).toBe(e);
    expect(instrByCoord[50]?.nextInstruction).toBe(null);
    expect(instrByCoord[59]?.nextInstruction).toBe(null);
  });

  it("handles instructions with large gaps", () => {
    const [a, b, c] = [
      newInstruction("start", [0, 5]),
      newInstruction("midpoint", [50, 55]),
      newInstruction("end", [95, 99]),
    ];

    const instructions = [a, b, c];
    const instrByCoord = instructionsByCoord(100, instructions);

    // Before first instruction ends
    expect(instrByCoord[0]?.nextInstruction).toBe(a);
    expect(instrByCoord[5]?.nextInstruction).toBe(a);

    // During gap between first and second
    expect(instrByCoord[6]?.nextInstruction).toBe(b);
    expect(instrByCoord[10]?.nextInstruction).toBe(b);
    expect(instrByCoord[49]?.nextInstruction).toBe(b);

    // During second instruction
    expect(instrByCoord[50]?.nextInstruction).toBe(b);
    expect(instrByCoord[55]?.nextInstruction).toBe(b);

    // During gap between second and third
    expect(instrByCoord[56]?.nextInstruction).toBe(c);
    expect(instrByCoord[94]?.nextInstruction).toBe(c);

    // During third instruction
    expect(instrByCoord[95]?.nextInstruction).toBe(c);
    expect(instrByCoord[99]?.nextInstruction).toBe(c);
  });

  it("handles overlapping instruction intervals", () => {
    // Edge case: instructions with overlapping intervals
    const [a, b, c] = [
      newInstruction("first", [0, 10]),
      newInstruction("second", [5, 15]),
      newInstruction("third", [12, 20]),
    ];

    const instructions = [a, b, c];
    const instrByCoord = instructionsByCoord(30, instructions);

    // The algorithm should find the first instruction not yet passed
    expect(instrByCoord[0]?.nextInstruction).toBe(a);
    expect(instrByCoord[10]?.nextInstruction).toBe(a);
    expect(instrByCoord[11]?.nextInstruction).toBe(b); // First instruction passed
    expect(instrByCoord[15]?.nextInstruction).toBe(b);
    expect(instrByCoord[16]?.nextInstruction).toBe(c); // Second instruction passed
    expect(instrByCoord[20]?.nextInstruction).toBe(c);
    expect(instrByCoord[21]?.nextInstruction).toBe(null); // All instructions passed
  });

  it("handles single-point instructions", () => {
    const [a, b, c] = [
      newInstruction("waypoint 1", [5, 5]),
      newInstruction("waypoint 2", [10, 10]),
      newInstruction("waypoint 3", [15, 15]),
    ];

    const instructions = [a, b, c];
    const instrByCoord = instructionsByCoord(20, instructions);

    expect(instrByCoord[0]?.nextInstruction).toBe(a);
    expect(instrByCoord[5]?.nextInstruction).toBe(a);
    expect(instrByCoord[6]?.nextInstruction).toBe(b);
    expect(instrByCoord[10]?.nextInstruction).toBe(b);
    expect(instrByCoord[11]?.nextInstruction).toBe(c);
    expect(instrByCoord[15]?.nextInstruction).toBe(c);
    expect(instrByCoord[16]?.nextInstruction).toBe(null);
  });

  it("handles route shorter than instruction intervals", () => {
    // Instructions expect a longer route
    const [a, b] = [newInstruction("far instruction", [100, 200]), newInstruction("very far", [300, 400])];

    const instructions = [a, b];
    const instrByCoord = instructionsByCoord(50, instructions);

    // All coordinates should point to the first instruction since none have passed it
    for (let i = 0; i < 50; i++) {
      expect(instrByCoord[i]?.nextInstruction).toBe(a);
    }
  });

  it("verifies O(n+m) complexity by checking sequential processing", () => {
    // Create many instructions and verify they're processed efficiently
    const instructions = Array.from({ length: 100 }, (_, i) =>
      newInstruction(`instruction ${i}`, [i * 10, i * 10 + 5]),
    );

    const routeLength = 1000;
    const instrByCoord = instructionsByCoord(routeLength, instructions);

    // Verify correct mapping at various points
    expect(instrByCoord[0]?.nextInstruction).toBe(instructions[0]);
    expect(instrByCoord[5]?.nextInstruction).toBe(instructions[0]);
    expect(instrByCoord[6]?.nextInstruction).toBe(instructions[1]);
    expect(instrByCoord[15]?.nextInstruction).toBe(instructions[1]);
    expect(instrByCoord[16]?.nextInstruction).toBe(instructions[2]);

    // Check near the end
    expect(instrByCoord[995]?.nextInstruction).toBe(instructions[99]);
    expect(instrByCoord[996]?.nextInstruction).toBe(null);

    // Verify all entries exist
    expect(instrByCoord.length).toBe(routeLength);
  });
});

it("finds next coordinate index depending on position", () => {
  const path = [x(0.9), x(1), x(2), x(3)];
  const poly = new IndexedPolygon(path);
  const at = (vec: Vector3) => poly.findClosestSegment(vec)?.closestSegmentStartIndex;

  expect(at(x(0.0))).toBe(0);
  expect(at(x(0.8))).toBe(0);
  expect(at(x(1.0))).toBe(0);
  expect(at(x(1.8))).toBe(1);
  expect(at(x(2.0))).toBe(1);
  expect(at(x(2.3))).toBe(2);
  expect(at(new Vector3(2.3, -1, 2))).toBe(2);
  expect(at(x(4.0))).toBe(2);
});

function x(x: number) {
  return new Vector3(x, 0, 0);
}

function newInstruction(text: string, interval: [number, number]): Instruction {
  return {
    distance: -9999,
    text: text,
    interval: interval,
    time: -9999,
    street_name: "1d street",
  };
}

describe("findClosestSegment overlapping", () => {
  function v(x: number, z: number, y: number = 0) {
    return new Vector3(x, y, z);
  }

  it("overlapping bounds", () => {
    const path = [v(2, 2), v(8, 8), v(8, 9), v(2, 3)];
    const lower = 0;
    const upper = 2;

    const poly = new IndexedPolygon(path);
    const at = (vec: Vector3) => poly.findClosestSegment(vec)?.closestSegmentStartIndex;

    expect(at(v(0, 0))).toBe(lower);
    expect(at(v(3, 3))).toBe(lower);
    expect(at(v(3, 4))).toBe(upper);
    expect(at(v(4, 3))).toBe(lower);
    expect(at(v(0, 9))).toBe(upper);
  });
});

describe("groundHeadingAlignment", () => {
  const east = new Vector3(1, 0, 0);

  it("is 1 when facing the same way, ignoring height", () => {
    expect(groundHeadingAlignment(new Vector3(2, 5, 0), east)).toBeCloseTo(1);
  });

  it("is negative when facing away", () => {
    expect(groundHeadingAlignment(new Vector3(-1, 0, 0), east)).toBeCloseTo(-1);
  });

  it("is roughly zero at a right angle", () => {
    expect(groundHeadingAlignment(new Vector3(0, 0, 1), east)).toBeCloseTo(0);
  });

  it("is null when a direction has no horizontal component", () => {
    expect(groundHeadingAlignment(new Vector3(0, 1, 0), east)).toBeNull();
    expect(groundHeadingAlignment(east, new Vector3(0, 3, 0))).toBeNull();
  });
});

describe("chooseNavigationAudioMode", () => {
  const facingTowards = 1;
  const facingAway = -1;

  it("plays danger regardless of direction", () => {
    expect(
      chooseNavigationAudioMode({ isDanger: true, guideAlignment: facingAway, segmentAlignment: facingAway }),
    ).toBe("danger");
  });

  it("is silent when there is no guide target", () => {
    expect(
      chooseNavigationAudioMode({ isDanger: false, guideAlignment: null, segmentAlignment: facingTowards }),
    ).toBeNull();
  });

  it("is correct when facing the guide target", () => {
    expect(
      chooseNavigationAudioMode({ isDanger: false, guideAlignment: facingTowards, segmentAlignment: facingAway }),
    ).toBe("correct direction");
  });

  it("is correct when facing away from the guide but along the route segment", () => {
    expect(
      chooseNavigationAudioMode({ isDanger: false, guideAlignment: facingAway, segmentAlignment: facingTowards }),
    ).toBe("correct direction");
  });

  it("is wrong only when facing away from both", () => {
    expect(
      chooseNavigationAudioMode({ isDanger: false, guideAlignment: facingAway, segmentAlignment: facingAway }),
    ).toBe("wrong direction");
  });

  it("falls back to the guide check when there is no usable route segment", () => {
    expect(chooseNavigationAudioMode({ isDanger: false, guideAlignment: facingTowards, segmentAlignment: null })).toBe(
      "correct direction",
    );
    expect(chooseNavigationAudioMode({ isDanger: false, guideAlignment: facingAway, segmentAlignment: null })).toBe(
      "wrong direction",
    );
  });
});

describe("navigationSoundFor", () => {
  it("barks for dog on wrong direction and danger", () => {
    expect(navigationSoundFor("wrong direction", "dog")).toBe("barking");
    expect(navigationSoundFor("danger", "dog")).toBe("barking");
  });

  it("uses distinct sounds for line navigator", () => {
    expect(navigationSoundFor("wrong direction", "line")).toBe("wrong direction");
    expect(navigationSoundFor("danger", "line")).toBe("danger");
  });

  it("is silent for correct direction and when there is no route target", () => {
    expect(navigationSoundFor("correct direction", "dog")).toBeNull();
    expect(navigationSoundFor("correct direction", "line")).toBeNull();
    expect(navigationSoundFor(null, "dog")).toBeNull();
    expect(navigationSoundFor(null, "line")).toBeNull();
  });
});

describe("guideLeadDirection", () => {
  const routeNorth = new Vector3(0, 0, -1);

  test("follows the route while the viewer is within 10 m of it", () => {
    const routeEightMetersEast = new Vector3(8, 0, 0);

    expect(guideLeadDirection(routeNorth, routeEightMetersEast, 5)).toBeDeepCloseTo(new Vector3(0, 0, -1));
  });

  test("follows the route while GPS is too inaccurate to tell that the viewer is off it", () => {
    const routeFifteenMetersEast = new Vector3(15, 0, 0);

    expect(guideLeadDirection(routeNorth, routeFifteenMetersEast, 20)).toBeDeepCloseTo(new Vector3(0, 0, -1));
  });

  test("leans toward the route the farther the viewer is off it", () => {
    const routeFifteenMetersEast = new Vector3(15, 0, 0);
    const leanedHalfOf45Degrees = new Vector3(Math.sin(Math.PI / 8), 0, -Math.cos(Math.PI / 8));

    expect(guideLeadDirection(routeNorth, routeFifteenMetersEast, null)).toBeDeepCloseTo(leanedHalfOf45Degrees, 3);
  });

  test("follows the route when the viewer is exactly on it", () => {
    expect(guideLeadDirection(routeNorth, new Vector3(0, 0, 0), 5)).toBeDeepCloseTo(new Vector3(0, 0, -1));
  });

  test("leads back to the route when it lies behind the viewer, e.g. past the destination", () => {
    const routeTwentyMetersBehindSlightlyEast = new Vector3(0.5, 0, 20);
    const routeTwentyMetersBehindSlightlyWest = new Vector3(-0.5, 0, 20);

    expect(guideLeadDirection(routeNorth, routeTwentyMetersBehindSlightlyEast, 5)).toBeDeepCloseTo(
      routeTwentyMetersBehindSlightlyEast.clone().normalize(),
    );
    expect(guideLeadDirection(routeNorth, routeTwentyMetersBehindSlightlyWest, 5)).toBeDeepCloseTo(
      routeTwentyMetersBehindSlightlyWest.clone().normalize(),
    );
  });

  test("never leads more than 45 degrees away from the route direction", () => {
    const routeFiftyMetersWest = new Vector3(-50, 0, 0);

    expect(guideLeadDirection(routeNorth, routeFiftyMetersWest, 5)).toBeDeepCloseTo(
      new Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2),
      3,
    );
  });
});
