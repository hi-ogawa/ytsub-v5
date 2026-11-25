import { z } from "zod";
import { withUseValue } from "../components/use-store-value.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

export const TEXT_SIZE = { default: 14, min: 12, max: 28 };

const DEFAULT_PREFERENCES = {
  autoScroll: true,
  fabOpen: {},
  textSize: TEXT_SIZE.default,
};

const preferencesSchema = z
  .object({
    autoScroll: z.boolean().catch(DEFAULT_PREFERENCES.autoScroll),
    fabOpen: z
      .record(z.string(), z.boolean())
      .catch(DEFAULT_PREFERENCES.fabOpen),
    textSize: z
      .number()
      .int()
      .min(TEXT_SIZE.min)
      .max(TEXT_SIZE.max)
      .catch(DEFAULT_PREFERENCES.textSize),
  })
  .catch(DEFAULT_PREFERENCES);

export const captionPanelPreferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:caption-panel",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);
