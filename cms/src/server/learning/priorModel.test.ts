import { expect, test, vi } from "vitest";
import type { InterestProfile, WalkCounts, WalkReport } from "../../shared/api.ts";
import { curatedPrior, type PriorModel } from "../profile/interest.ts";
import type { AssociationRule } from "./apriori.ts";
import { buildPriorModel, withRuleBoost } from "./priorModel.ts";

const installCountNeeded = 30;
const reportCountNeededPerInstall = 3;
const reportCountNeededForRules = 1_000;
const ruleBoostWeight = 0.3;

const walkReportOf = (installId: string, counts: WalkCounts): WalkReport => ({
  installId,
  consentVersion: 1,
  appVersion: "1.4.0",
  walkedOn: "2026-10-21",
  mode: "explore",
  durationMinutes: 23.5,
  medianSpeedMetresPerSecond: 1.2,
  pauseCount: 2,
  arTrackingShare: 0.35,
  language: "de",
  counts,
});

// Each report shows every subtype 10 times, so three reports of an install add up to 30 showings per subtype.
const countsEngaging = (engagedPerSubtype: Record<string, number>): WalkCounts =>
  Object.fromEntries(Object.entries(engagedPerSubtype).map(([subtype, engaged]) => [subtype, { shown: 10, engaged }]));

const cafeLoverCounts = countsEngaging({ cafe: 9, bakery: 8, bar: 1 });
const barLoverCounts = countsEngaging({ cafe: 1, bakery: 2, bar: 9 });

function installsSendingReports(installCount: number, reportCount: number): WalkReport[] {
  return Array.from({ length: installCount }, (_, installNumber) => {
    const counts = installNumber % 2 === 0 ? cafeLoverCounts : barLoverCounts;
    return Array.from({ length: reportCount }, () => walkReportOf(`install-${installNumber}`, counts));
  }).flat();
}

const cafeLikingProfile = { cafe: { shown: 10, engaged: 9 }, bar: { shown: 10, engaged: 1 } };

test("the curated prior applies until 30 installs have sent 3 reports each", () => {
  const modelOf = (installCount: number, reportCount: number) =>
    buildPriorModel(installsSendingReports(installCount, reportCount));
  const bakeryPriorOf = (model: ReturnType<typeof modelOf>) => model("bakery", cafeLikingProfile);

  expect(bakeryPriorOf(modelOf(installCountNeeded - 1, reportCountNeededPerInstall))).toBe(curatedPrior("bakery"));
  expect(bakeryPriorOf(modelOf(installCountNeeded, reportCountNeededPerInstall - 1))).toBe(curatedPrior("bakery"));
  expect(bakeryPriorOf(modelOf(installCountNeeded, reportCountNeededPerInstall))).toBeCloseTo(0.9);
});

test("installs with fewer reports do not hold back the others", () => {
  const reports = [
    ...installsSendingReports(installCountNeeded, reportCountNeededPerInstall),
    walkReportOf("a-newcomer", cafeLoverCounts),
  ];

  expect(buildPriorModel(reports)("bakery", cafeLikingProfile)).toBeCloseTo(0.9);
});

test("subtypes without a collaborative prior fall back to the curated prior", () => {
  const model = buildPriorModel(installsSendingReports(installCountNeeded, reportCountNeededPerInstall));

  expect(model("museum", cafeLikingProfile)).toBe(curatedPrior("museum"));
  expect(model("bakery", {})).toBe(curatedPrior("bakery"));
  expect(model("bakery", { cafe: { shown: 10, engaged: 9 } })).toBe(curatedPrior("bakery"));
});

test("rules apply only from 1,000 walk reports and never push the prior above 1", () => {
  const reports = installsSendingReports(reportCountNeededForRules / 10, 10);
  const bakeryPriorOf = (model: ReturnType<typeof buildPriorModel>) => model("bakery", cafeLikingProfile);

  expect(bakeryPriorOf(buildPriorModel(reports.slice(1)))).toBeCloseTo(0.9);
  expect(bakeryPriorOf(buildPriorModel(reports))).toBe(1);
});

test("rules boost the base prior by the user's five most interesting subtypes only", () => {
  const reports = Array.from({ length: reportCountNeededForRules }, (_, installNumber) =>
    walkReportOf(`install-${installNumber}`, countsEngaging({ cafe: 1, books: 1 })),
  );
  const engagedWithHalf = { shown: 10, engaged: 5 };
  const fiveOthers = {
    bar: engagedWithHalf,
    bakery: engagedWithHalf,
    museum: engagedWithHalf,
    restaurant: engagedWithHalf,
    park: engagedWithHalf,
  };
  const model = buildPriorModel(reports);

  const cafeIsFavourite = { ...fiveOthers, cafe: { shown: 10, engaged: 10 } };
  const cafeIsNotAFavourite = { ...fiveOthers, cafe: { shown: 10, engaged: 0 } };

  expect(model("books", cafeIsFavourite)).toBeCloseTo(curatedPrior("books") + ruleBoostWeight);
  expect(model("books", cafeIsNotAFavourite)).toBeCloseTo(curatedPrior("books"));
});

test("the rule boost looks up a profile's top subtypes once, however many subtypes are asked", () => {
  const baseModel = vi.fn<PriorModel>(() => 0.5);
  const rules: AssociationRule[] = [{ antecedent: ["cafe"], consequent: "books", confidence: 0.6 }];
  const model = withRuleBoost(baseModel, rules);
  const profile: InterestProfile = { cafe: { shown: 10, engaged: 9 }, bar: { shown: 10, engaged: 1 } };
  const otherSubtypesAsked = ["museum", "park", "bakery", "bar"];

  model("books", profile);
  const baseModelCallsForFirstSubtype = baseModel.mock.calls.length;
  otherSubtypesAsked.forEach((subtype) => model(subtype, profile));

  // Beyond the first subtype, each one costs the single base model call for its own prior.
  expect(baseModel.mock.calls.length - baseModelCallsForFirstSubtype).toBe(otherSubtypesAsked.length);
  expect(model("books", profile)).toBeCloseTo(0.5 + ruleBoostWeight * 0.6);
});

test("the rule boost computes the top subtypes of every profile object on its own", () => {
  const baseModel = vi.fn<PriorModel>(() => 0.5);
  const model = withRuleBoost(baseModel, [{ antecedent: ["cafe"], consequent: "books", confidence: 0.6 }]);
  const profile: InterestProfile = { cafe: { shown: 10, engaged: 9 }, bar: { shown: 10, engaged: 1 } };

  model("books", profile);
  const baseModelCallsForFirstProfile = baseModel.mock.calls.length;
  model("books", { ...profile });

  expect(baseModel.mock.calls.length).toBe(2 * baseModelCallsForFirstProfile);
  expect(model("books", { bar: { shown: 10, engaged: 9 } })).toBeCloseTo(0.5);
});
