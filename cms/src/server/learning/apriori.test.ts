import { expect, test } from "vitest";
import { associationRules, ruleBoost, type AssociationRule, type Basket } from "./apriori.ts";

const basketCount = 1_000;
const installCountOfPlantedRule = 50;

const repeated = <Item>(count: number, item: Item): Item[] => Array.from({ length: count }, () => item);

// Consecutive baskets belong to consecutive installs, so any run of at least `installCount` baskets spans all of them.
function basketsSpreadOverInstalls(subtypesPerBasket: string[][], installCount: number): Basket[] {
  return subtypesPerBasket.map((subtypes, index) => ({ installId: `install-${index % installCount}`, subtypes }));
}

test("finds a rule planted in the baskets", () => {
  const baskets = basketsSpreadOverInstalls(
    [
      ...repeated(300, ["museum", "cafe", "books"]),
      ...repeated(100, ["museum", "cafe"]),
      ...repeated(basketCount - 400, ["bar"]),
    ],
    installCountOfPlantedRule,
  );

  expect(associationRules(baskets)).toContainEqual({
    antecedent: ["cafe", "museum"],
    consequent: "books",
    confidence: 0.75,
  });
});

test("rules below 50 % confidence are dropped", () => {
  const baskets = basketsSpreadOverInstalls(
    [...repeated(40, ["a", "b"]), ...repeated(60, ["a"]), ...repeated(900, ["c"])],
    installCountOfPlantedRule,
  );

  expect(associationRules(baskets)).toEqual([{ antecedent: ["b"], consequent: "a", confidence: 1 }]);
});

test("itemsets below 2 % support yield no rules", () => {
  // Both subtypes are common enough on their own and each predicts the other with 19 / 30 confidence, so only the
  // 19 of 1,000 baskets that hold them together keep the pair below the threshold.
  const basketsWithPairIn = (pairBasketCount: number) =>
    basketsSpreadOverInstalls(
      [
        ...repeated(pairBasketCount, ["a", "b"]),
        ...repeated(30 - pairBasketCount, ["a"]),
        ...repeated(30 - pairBasketCount, ["b"]),
        ...repeated(basketCount - 60 + pairBasketCount, ["c"]),
      ],
      installCountOfPlantedRule,
    );

  expect(associationRules(basketsWithPairIn(19))).toEqual([]);
  expect(associationRules(basketsWithPairIn(20))).toHaveLength(2);
});

test("itemsets from fewer than 10 installs yield no rules even above the support threshold", () => {
  const pairBaskets = repeated(100, ["a", "b"]);

  expect(associationRules(basketsSpreadOverInstalls(pairBaskets, 9))).toEqual([]);
  expect(associationRules(basketsSpreadOverInstalls(pairBaskets, 10))).toHaveLength(2);
});

test("no itemset has more than 3 subtypes", () => {
  const baskets = basketsSpreadOverInstalls(repeated(100, ["a", "b", "c", "d", "e"]), 20);

  const itemsetSizes = associationRules(baskets).map(({ antecedent }) => antecedent.length + 1);

  expect(Math.max(...itemsetSizes)).toBe(3);
});

test("no baskets yield no rules", () => expect(associationRules([])).toEqual([]));

test("the boost uses the strongest matching rule and ignores rules whose antecedent is not covered", () => {
  const rules: AssociationRule[] = [
    { antecedent: ["cafe"], consequent: "books", confidence: 0.6 },
    { antecedent: ["cafe", "museum"], consequent: "books", confidence: 0.8 },
    { antecedent: ["bar"], consequent: "books", confidence: 0.9 },
    { antecedent: ["cafe"], consequent: "bakery", confidence: 0.7 },
  ];

  expect(ruleBoost("books", ["cafe", "museum"], rules)).toBeCloseTo(0.3 * 0.8);
  expect(ruleBoost("books", ["cafe"], rules)).toBeCloseTo(0.3 * 0.6);
  expect(ruleBoost("books", ["museum"], rules)).toBe(0);
  expect(ruleBoost("park", ["cafe", "museum", "bar"], rules)).toBe(0);
});
