import type { InterestProfile, WalkCounts, WalkReport } from "../../shared/api.ts";
import { groupedBy, memoisedByObject } from "../../shared/JavascriptExtensions.ts";
import { curatedPrior, curatedPriorModel, interestOf, type PriorModel } from "../profile/interest.ts";
import { associationRules, ruleBoost, type AssociationRule, type Basket } from "./apriori.ts";
import { collaborativePrior, engagementRatesOf, subtypeSimilarities } from "./collaborativeFiltering.ts";

const minimumReportsPerInstall = 3;
const minimumInstallsForCollaborativeFiltering = 30;
const minimumReportsForAssociationRules = 1_000;
const topSubtypeCount = 5;

function reportsPerInstallOf(reports: WalkReport[]): WalkReport[][] {
  return [...groupedBy(reports, ({ installId }) => installId).values()];
}

function summedCounts(reports: WalkReport[]): WalkCounts {
  const summed: WalkCounts = {};
  for (const { counts } of reports) {
    for (const [subtype, { shown, engaged }] of Object.entries(counts)) {
      const sofar = summed[subtype] ?? { shown: 0, engaged: 0 };
      summed[subtype] = { shown: sofar.shown + shown, engaged: sofar.engaged + engaged };
    }
  }
  return summed;
}

// Until enough installs reported, similarities between subtypes would only reflect a handful of people, so the
// curated ranking stays in charge.
export function hasEnoughReportsForCollaborativeFiltering(reports: WalkReport[]): boolean {
  const installCount = reportsPerInstallOf(reports).filter(
    (installReports) => installReports.length >= minimumReportsPerInstall,
  ).length;
  return installCount >= minimumInstallsForCollaborativeFiltering;
}

// Rules need many walks to tell habits from coincidences; the thresholds inside the rule search guard the rest.
export function hasEnoughReportsForAssociationRules(reports: WalkReport[]): boolean {
  return reports.length >= minimumReportsForAssociationRules;
}

function collaborativeModelOf(reports: WalkReport[]): PriorModel {
  const similarities = subtypeSimilarities(
    reportsPerInstallOf(reports).map((installReports) => engagementRatesOf(summedCounts(installReports))),
  );
  // A ranking request asks for the prior of every candidate place with the same profile object.
  const ratesOf = memoisedByObject(engagementRatesOf);
  return (subtype, profile) => collaborativePrior(subtype, ratesOf(profile), similarities) ?? curatedPrior(subtype);
}

export function basketOf({ installId, counts }: WalkReport): Basket {
  const engagedSubtypes = Object.entries(counts).filter(([, { engaged }]) => engaged > 0);
  return { installId, subtypes: engagedSubtypes.map(([subtype]) => subtype) };
}

function topSubtypesOf(profile: InterestProfile, baseModel: PriorModel): string[] {
  return Object.keys(profile)
    .map((subtype): [string, number] => [subtype, interestOf(subtype, profile, baseModel)])
    .sort(([, interest], [, otherInterest]) => otherInterest - interest)
    .slice(0, topSubtypeCount)
    .map(([subtype]) => subtype);
}

export function withRuleBoost(baseModel: PriorModel, rules: AssociationRule[]): PriorModel {
  const consequents = [...new Set(rules.map(({ consequent }) => consequent))];
  // A ranking request asks for the prior of every candidate place with the same profile object. Finding the top
  // subtypes costs a base model call per profile subtype, so it must not be repeated for each place.
  const boostsOf = memoisedByObject((profile: InterestProfile): Map<string, number> => {
    const topSubtypes = topSubtypesOf(profile, baseModel);
    return new Map(
      consequents.map((consequent): [string, number] => [consequent, ruleBoost(consequent, topSubtypes, rules)]),
    );
  });
  return (subtype, profile) => Math.min(1, baseModel(subtype, profile) + (boostsOf(profile).get(subtype) ?? 0));
}

export function buildPriorModel(reports: WalkReport[]): PriorModel {
  const baseModel = hasEnoughReportsForCollaborativeFiltering(reports)
    ? collaborativeModelOf(reports)
    : curatedPriorModel;
  return hasEnoughReportsForAssociationRules(reports)
    ? withRuleBoost(baseModel, associationRules(reports.map(basketOf)))
    : baseModel;
}
