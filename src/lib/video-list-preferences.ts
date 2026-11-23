import { z } from "zod";
import { withUseValue } from "../components/use-store-value.ts";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";

export type VideoListLayout = "grid" | "list";

const preferencesSchema = z
  .object({
    layout: z.enum(["grid", "list"]).optional().catch(undefined),
  })
  .catch({});

export const videoListPreferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:video-list",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);
