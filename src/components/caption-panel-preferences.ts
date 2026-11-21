import { z } from "zod";
import { createLocalStorageStore } from "../utils/local-storage-store.ts";
import { withUseValue } from "./use-store-value.ts";

const DEFAULT_PREFERENCES = { autoScroll: true, fabOpen: {} };

const preferencesSchema = z
  .object({
    autoScroll: z.boolean().catch(DEFAULT_PREFERENCES.autoScroll),
    fabOpen: z
      .record(z.string(), z.boolean())
      .catch(DEFAULT_PREFERENCES.fabOpen),
  })
  .catch(DEFAULT_PREFERENCES);

const preferences = withUseValue(
  createLocalStorageStore({
    key: "zamak:caption-panel",
    parse: (stored) => preferencesSchema.parse(stored),
  }),
);

export function useFabOpen(videoId: string) {
  const [fabOpen, setFabOpen] = preferences.useValue("fabOpen");
  const open = fabOpen[videoId] ?? false;
  const toggle = () => setFabOpen((prev) => ({ ...prev, [videoId]: !open }));
  return [open, toggle] as const;
}

export function useAutoScroll() {
  return preferences.useValue("autoScroll");
}
