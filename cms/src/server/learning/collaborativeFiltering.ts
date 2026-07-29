import type { WalkCounts } from "../../shared/api.ts";
import { clamp, getOrCreate, mean, sum } from "../../shared/JavascriptExtensions.ts";
import { isSensitiveSubtype } from "../profile/sensitiveSubtypes.ts";

// The share of a subtype's showings that were engaged with, between 0 and 1, keyed by subtype.
export type EngagementRates = Map<string, number>;
// Between -1 and 1, symmetric, and only holding the pairs that enough installs rated.
export type SimilarityMatrix = Map<string, Map<string, number>>;

const minimumShowingsForRate = 3;
const minimumCoRatingInstalls = 10;
// The prior measures the user's rates from their own mean. A single rate is that mean, so its deviation is 0, and the
// prior would only repeat that one rate for every similar subtype, whatever the similarity says.
const minimumRatedSubtypesForCollaborativePrior = 2;

// With fewer showings the rate says little: a single showing would already rate the subtype 0 or 1. Sensitive keys
// are skipped because a ranking profile comes from the client, which may send them although the app never does.
export function engagementRatesOf(counts: WalkCounts): EngagementRates {
  return new Map(
    Object.entries(counts)
      .filter(([subtype, { shown }]) => shown >= minimumShowingsForRate && !isSensitiveSubtype(subtype))
      .map(([subtype, { shown, engaged }]): [string, number] => [subtype, engaged / shown]),
  );
}

type PairSums = {
  coRatingInstalls: number;
  productsOfDeviations: number;
  squaredDeviationsOfFirst: number;
  squaredDeviationsOfSecond: number;
};

const noPairSums = (): PairSums => ({
  coRatingInstalls: 0,
  productsOfDeviations: 0,
  squaredDeviationsOfFirst: 0,
  squaredDeviationsOfSecond: 0,
});

// Sorted by subtype, so that every install lists a pair in the same order.
function deviationsFromMean(rates: EngagementRates): [string, number][] {
  const meanRate = mean([...rates.values()]);
  return [...rates]
    .map(([subtype, rate]): [string, number] => [subtype, rate - meanRate])
    .sort(([subtype], [otherSubtype]) => (subtype < otherSubtype ? -1 : 1));
}

function adjustedCosine(sums: PairSums): number | null {
  if (sums.coRatingInstalls < minimumCoRatingInstalls) return null;
  const denominator = Math.sqrt(sums.squaredDeviationsOfFirst) * Math.sqrt(sums.squaredDeviationsOfSecond);
  return denominator === 0 ? null : sums.productsOfDeviations / denominator;
}

// Adjusted cosine similarity: every rate is measured from its install's mean rate. Installs engage with very
// different shares of what they are shown, and plain cosine on the raw (never negative) rates would make every pair
// of subtypes look similar.
export function subtypeSimilarities(ratesPerInstall: EngagementRates[]): SimilarityMatrix {
  const sumsPerPair = new Map<string, Map<string, PairSums>>();
  for (const rates of ratesPerInstall) {
    const deviations = deviationsFromMean(rates);
    deviations.forEach(([first, firstDeviation], firstIndex) => {
      for (const [second, secondDeviation] of deviations.slice(firstIndex + 1)) {
        const sums = getOrCreate(
          getOrCreate(sumsPerPair, first, () => new Map()),
          second,
          noPairSums,
        );
        sums.coRatingInstalls += 1;
        sums.productsOfDeviations += firstDeviation * secondDeviation;
        sums.squaredDeviationsOfFirst += firstDeviation ** 2;
        sums.squaredDeviationsOfSecond += secondDeviation ** 2;
      }
    });
  }

  const similarities: SimilarityMatrix = new Map();
  for (const [first, sumsPerSecond] of sumsPerPair) {
    for (const [second, sums] of sumsPerSecond) {
      const similarity = adjustedCosine(sums);
      if (similarity === null) continue;
      getOrCreate(similarities, first, () => new Map()).set(second, similarity);
      getOrCreate(similarities, second, () => new Map()).set(first, similarity);
    }
  }
  return similarities;
}

// The user's own mean plus the average deviation of their other subtypes, each weighted by its similarity to this
// subtype: liking what is similar raises the prediction, liking what is opposite lowers it.
export function collaborativePrior(
  subtype: string,
  ownRates: EngagementRates,
  similarities: SimilarityMatrix,
): number | null {
  if (ownRates.size < minimumRatedSubtypesForCollaborativePrior) return null;
  const similaritiesToSubtype = similarities.get(subtype);
  if (similaritiesToSubtype === undefined) return null;

  const ownMean = mean([...ownRates.values()]);
  const neighbours = [...ownRates].flatMap(([ratedSubtype, rate]) => {
    const similarity = similaritiesToSubtype.get(ratedSubtype);
    return ratedSubtype === subtype || similarity === undefined ? [] : [{ similarity, deviation: rate - ownMean }];
  });
  const totalWeight = sum(neighbours.map(({ similarity }) => Math.abs(similarity)));
  if (totalWeight === 0) return null;

  const weightedDeviation = sum(neighbours.map(({ similarity, deviation }) => similarity * deviation)) / totalWeight;
  return clamp(ownMean + weightedDeviation, 0, 1);
}
