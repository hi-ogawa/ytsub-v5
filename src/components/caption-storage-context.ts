import { createContext, useContext } from "react";
import type { CaptionStorage } from "../lib/caption-storage.ts";

const CaptionStorageContext = createContext<CaptionStorage | undefined>(
  undefined,
);

export const CaptionStorageProvider = CaptionStorageContext.Provider;

export function useCaptionStorage(): CaptionStorage {
  const storage = useContext(CaptionStorageContext);
  if (!storage) {
    throw new Error("useCaptionStorage requires a CaptionStorageProvider");
  }
  return storage;
}
