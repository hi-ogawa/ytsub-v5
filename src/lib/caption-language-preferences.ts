import { z } from "zod";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

const preferencesSchema = z
  .object({
    lang1: z.string().optional().catch(undefined),
    lang2: z.string().optional().catch(undefined),
  })
  .catch({});

/** The languages of the last picked track pair, which seed the next video. */
export const captionLanguagePreferences = createLocalStorageStore({
  key: "zamak:preferred-langs",
  parse: (stored) => preferencesSchema.parse(stored),
});
