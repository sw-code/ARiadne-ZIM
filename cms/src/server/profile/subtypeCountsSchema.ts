import { z, type ZodType } from "zod";
import { stringWithoutControlCharacters } from "../ZodExtensions.ts";

const maxSubtypesPerProfile = 500;

const countSchema = z.number().int().nonnegative();

export const engagementCountsSchema = z
  .object({ shown: countSchema, engaged: countSchema })
  // Every engagement follows a showing. Counts that break this were not produced by the app, and they would push
  // the interest above 1.
  .refine(({ engaged, shown }) => engaged <= shown, { message: "engaged must not exceed shown" });

export const countsPerSubtypeSchema = <Counts extends ZodType>(countsSchema: Counts) =>
  z
    .record(stringWithoutControlCharacters, countsSchema)
    .refine((countsPerSubtype) => Object.keys(countsPerSubtype).length <= maxSubtypesPerProfile, {
      message: `more than ${maxSubtypesPerProfile} subtypes`,
    });
