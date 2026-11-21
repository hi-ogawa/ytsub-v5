import { z } from "zod";
import { withUseValue } from "../components/use-store-value.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

const DEFAULT_PREFERENCES = { autoScroll: true, fabOpen: {} };

const preferencesSchema = z
  .object({
    autoScroll: z.boolean().catch(DEFAULT_PREFERENCES.autoScroll),
    fabOpen: z
      .record(z.string(), z.boolean())
      .catch(DEFAULT_PREFERENCES.fabOpen),
  })
  .catch(DEFAULT_PREFERENCES);

export const preferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:caption-panel",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);
