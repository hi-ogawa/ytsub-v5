import { z } from "zod";
import { withUseValue } from "../components/use-store-value.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

export const TEXT_SIZE = { default: 14, min: 12, max: 28 };
export const PANEL_WIDTH = { default: 400, min: 280, max: 800 };

const DEFAULT_PREFERENCES = {
  autoScroll: true,
  fabOpen: {},
  panelWidth: PANEL_WIDTH.default,
  textSize: TEXT_SIZE.default,
};

const preferencesSchema = z
  .object({
    autoScroll: z.boolean().catch(DEFAULT_PREFERENCES.autoScroll),
    fabOpen: z
      .record(z.string(), z.boolean())
      .catch(DEFAULT_PREFERENCES.fabOpen),
    panelWidth: z
      .number()
      .min(PANEL_WIDTH.min)
      .max(PANEL_WIDTH.max)
      .catch(DEFAULT_PREFERENCES.panelWidth),
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
