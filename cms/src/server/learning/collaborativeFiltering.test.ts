import { expect, test } from "vitest";
import {
  collaborativePrior,
  engagementRatesOf,
  subtypeSimilarities,
  type EngagementRates,
  type SimilarityMatrix,
} from "./collaborativeFiltering.ts";

const minimumCoRatingInstalls = 10;

const ratesOf = (ratePerSubtype: Record<string, number>): EngagementRates => new Map(Object.entries(ratePerSubtype));

const installsWithRates = (installCount: number, ratePerSubtype: Record<string, number>): EngagementRates[] =>
  Array.from({ length: installCount }, () => ratesOf(ratePerSubtype));

// Café and bakery are engaged with together, and bar is what the other installs prefer instead.
const cafeLovingInstalls = installsWithRates(6, { cafe: 0.9, bakery: 0.8, bar: 0.1 });
const barLovingInstalls = installsWithRates(6, { cafe: 0.1, bakery: 0.2, bar: 0.9 });
const cafeAndBarInstalls = [...cafeLovingInstalls, ...barLovingInstalls];

const similarityBetween = (similarities: SimilarityMatrix, first: string, second: string): number | undefined =>
  similarities.get(first)?.get(second);

test("subtypes that the same installs like together become similar, opposites become negative", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  expect(similarityBetween(similarities, "cafe", "bakery")).toBeCloseTo(1);
  expect(similarityBetween(similarities, "cafe", "bar")).toBeCloseTo(-1);
});

test("the similarity of two subtypes is the same in both directions", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  expect(similarityBetween(similarities, "bakery", "cafe")).toBe(similarityBetween(similarities, "cafe", "bakery"));
});

test("pairs rated by fewer than 10 installs are left out", () => {
  const justTooFew = installsWithRates(minimumCoRatingInstalls - 1, { cafe: 0.9, bakery: 0.8, bar: 0.1 });
  const justEnough = installsWithRates(minimumCoRatingInstalls, { cafe: 0.9, bakery: 0.8, bar: 0.1 });

  expect(subtypeSimilarities(justTooFew).get("cafe")?.has("bakery")).toBeFalsy();
  expect(subtypeSimilarities(justEnough).get("cafe")?.has("bakery")).toBe(true);
});

test("a pair without any variation among its co-rating installs has no similarity", () => {
  const installsRatingEverythingTheSame = installsWithRates(minimumCoRatingInstalls, { cafe: 0.5, bakery: 0.5 });

  expect(subtypeSimilarities(installsRatingEverythingTheSame).size).toBe(0);
});

test("subtypes with fewer than 3 showings carry no rate", () => {
  const rates = engagementRatesOf({
    cafe: { shown: 2, engaged: 2 },
    bakery: { shown: 3, engaged: 1 },
    bar: { shown: 4, engaged: 4 },
  });

  expect(rates).toEqual(
    new Map([
      ["bakery", 1 / 3],
      ["bar", 1],
    ]),
  );
});

test("sensitive subtypes carry no rate, however often they were shown", () => {
  const rates = engagementRatesOf({
    pharmacy: { shown: 10, engaged: 10 },
    place_of_worship: { shown: 10, engaged: 5 },
    cafe: { shown: 10, engaged: 5 },
  });

  expect(rates).toEqual(new Map([["cafe", 0.5]]));
});

test("a user who likes cafés gets a bakery prior above their mean", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);
  const ownRates = ratesOf({ cafe: 0.9, bar: 0.1 });
  const ownMean = 0.5;

  const prior = collaborativePrior("bakery", ownRates, similarities);

  expect(prior).toBeGreaterThan(ownMean);
  expect(prior).toBeCloseTo(0.9);
});

test("a user who dislikes cafés gets a bakery prior below their mean", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  expect(collaborativePrior("bakery", ratesOf({ cafe: 0.1, bar: 0.9 }), similarities)).toBeCloseTo(0.1);
});

test("with a single rated subtype there is no collaborative prior; with two there is", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  // A single rate is the user's mean, so its deviation is 0 and it would only be repeated for every similar subtype.
  expect(collaborativePrior("bakery", ratesOf({ cafe: 0.9 }), similarities)).toBeNull();
  expect(collaborativePrior("bakery", ratesOf({ cafe: 0.9, bar: 0.1 }), similarities)).toBeCloseTo(0.9);
});

test("without a similar rated subtype there is no collaborative prior", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  expect(collaborativePrior("bakery", ratesOf({ museum: 0.7, theatre: 0.3 }), similarities)).toBeNull();
  expect(collaborativePrior("bakery", ratesOf({}), similarities)).toBeNull();
});

test("a subtype's own rate does not predict itself", () => {
  const similarities = subtypeSimilarities(cafeAndBarInstalls);

  expect(collaborativePrior("bakery", ratesOf({ bakery: 0.7, museum: 0.3 }), similarities)).toBeNull();
});

test("a similarity of zero gives no prediction", () => {
  const similarities: SimilarityMatrix = new Map([["bakery", new Map([["cafe", 0]])]]);

  expect(collaborativePrior("bakery", ratesOf({ cafe: 0.9, museum: 0.1 }), similarities)).toBeNull();
});

test("the collaborative prior stays between 0 and 1", () => {
  const similarities: SimilarityMatrix = new Map([["bakery", new Map([["bar", -1]])]]);

  // The mean is 2/3, and disliking bar (opposite of bakery) would lift the prediction to 2/3 + 2/3 = 1.33.
  expect(collaborativePrior("bakery", ratesOf({ bar: 0, cafe: 1, museum: 1 }), similarities)).toBe(1);
});
