import { createLocalStorageStore } from "./external-store.ts";

export const autoScrollStore = createLocalStorageStore(
  "zamak:auto-scroll",
  true,
);
