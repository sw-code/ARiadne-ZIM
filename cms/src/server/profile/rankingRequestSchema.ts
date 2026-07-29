import { z } from "zod";
import { countsPerSubtypeSchema, engagementCountsSchema } from "./subtypeCountsSchema.ts";

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
const latLongSchema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema });

const subtypeCountsSchema = engagementCountsSchema.safeExtend({ choice: z.enum(["more", "less"]).exactOptional() });

export const rankingRequestSchema = z.object({
  start: latLongSchema,
  destination: latLongSchema,
  profile: countsPerSubtypeSchema(subtypeCountsSchema).exactOptional(),
});
