import { expect, test } from "vitest";
import { curatedPriorModel, interestOf, type PriorModel } from "./interest.ts";
import { isSensitive } from "./sensitiveSubtypes.ts";

const halfPrior: PriorModel = () => 0.5;

test("without any showings the interest is the curated prior", () => {
  expect(interestOf("restaurant", {}, curatedPriorModel)).toBe(0.5);
  expect(interestOf("insurance", {}, curatedPriorModel)).toBeCloseTo(0.05);
  expect(interestOf("not_a_curated_subtype", {}, curatedPriorModel)).toBe(0.05);
});

test("five engagements in five showings pull the prior halfway to certainty", () => {
  expect(interestOf("cafe", { cafe: { shown: 5, engaged: 5 } }, halfPrior)).toBe(0.75);
});

test("five ignored showings halve the prior", () => {
  expect(interestOf("cafe", { cafe: { shown: 5, engaged: 0 } }, halfPrior)).toBe(0.25);
});

test("an explicit choice replaces the prior and behaviour still corrects it", () => {
  expect(interestOf("cafe", { cafe: { shown: 0, engaged: 0, choice: "more" } }, halfPrior)).toBe(0.9);
  expect(interestOf("cafe", { cafe: { shown: 5, engaged: 5, choice: "less" } }, halfPrior)).toBeCloseTo(0.525);
});

test("health and religious places are sensitive", () => {
  expect(isSensitive({ category: "healthcare", subtype: "anything" })).toBe(true);
  expect(isSensitive({ category: "amenity", subtype: "pharmacy" })).toBe(true);
  expect(isSensitive({ category: "amenity", subtype: "place_of_worship" })).toBe(true);
  expect(isSensitive({ category: "amenity", subtype: "cafe" })).toBe(false);
});
