import type { InterestChoice, InterestProfile } from "../../shared/api.ts";
import { curatedSubtypeRanking } from "./curatedSubtypeRanking.ts";

// Receives the whole profile so that a later model (collaborative filtering) can predict from the user's other
// subtypes.
export type PriorModel = (subtype: string, profile: InterestProfile) => number;

const priorWeightInShowings = 5;

const firstCuratedPrior = 0.5;
const lastCuratedPrior = 0.05;
const uncuratedPrior = lastCuratedPrior;

const choicePrior: Record<InterestChoice, number> = { more: 0.9, less: 0.05 };

// Linear from the first to the last subtype of the curated ranking.
export function curatedPrior(subtype: string): number {
  const rank = curatedSubtypeRanking.indexOf(subtype);
  if (rank === -1) return uncuratedPrior;
  const fractionOfRanking = rank / (curatedSubtypeRanking.length - 1);
  return firstCuratedPrior + fractionOfRanking * (lastCuratedPrior - firstCuratedPrior);
}

export const curatedPriorModel: PriorModel = (subtype) => curatedPrior(subtype);

// The prior counts as `priorWeightInShowings` imaginary showings of which a share equal to the prior was engaged
// with. Real behaviour therefore starts out cautious and takes over as showings accumulate, and an explicit choice
// only replaces the starting point instead of overriding what the user then actually does.
export function interestOf(subtype: string, profile: InterestProfile, priorModel: PriorModel): number {
  const counts = profile[subtype];
  const shown = counts?.shown ?? 0;
  const engaged = counts?.engaged ?? 0;
  const prior = counts?.choice === undefined ? priorModel(subtype, profile) : choicePrior[counts.choice];
  return (engaged + priorWeightInShowings * prior) / (shown + priorWeightInShowings);
}
