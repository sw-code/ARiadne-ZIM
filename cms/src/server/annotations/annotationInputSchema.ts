import { z } from "zod";
import { maxAnnotationTextCharacters, maxAnnotationTitleCharacters } from "../../shared/annotationLimits.ts";

// A date that is well-formed but not on the calendar (2026-02-31) would reach Postgres and fail there as a 500.
const optionalDateSchema = z.iso.date("Ungültiges Datum").nullable();

export const annotationInputSchema = z
  .object({
    placeId: z.string().min(1, "Ort fehlt"),
    title: z
      .string()
      .trim()
      .min(1, "Titel fehlt")
      .max(maxAnnotationTitleCharacters, `Titel ist zu lang (max. ${maxAnnotationTitleCharacters} Zeichen)`),
    text: z
      .string()
      .trim()
      .min(1, "Text fehlt")
      .max(maxAnnotationTextCharacters, `Text ist zu lang (max. ${maxAnnotationTextCharacters} Zeichen)`),
    validFrom: optionalDateSchema,
    validTo: optionalDateSchema,
  })
  // Zero-padded ISO dates compare correctly as strings. The database enforces the same rule, but only as a 500.
  .refine(({ validFrom, validTo }) => validFrom === null || validTo === null || validTo >= validFrom, {
    message: "„Gültig bis“ liegt vor „Gültig von“",
  });

// Postgres throws on a malformed uuid, so an id that is not one is turned away before it reaches the database.
export function isAnnotationId(id: string): boolean {
  return z.uuid().safeParse(id).success;
}
