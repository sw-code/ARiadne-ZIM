import { z } from "zod";

// Postgres rejects NUL in text and in jsonb keys, and fails the whole request with a 500. No other control character
// belongs into the identifiers and versions the app sends either.
export const stringWithoutControlCharacters = z.string().regex(/^[^\p{Cc}]*$/u, "must not contain control characters");
