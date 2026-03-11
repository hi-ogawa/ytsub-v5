import { useCallback, useSyncExternalStore } from "react";

function eventName(key: string) {
  return `localStorage:${key}`;
}

function readValue<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Notify same-tab listeners that a localStorage key changed. */
export function notifyLocalStorage(key: string) {
  window.dispatchEvent(new Event(eventName(key)));
}

/**
 * useState-like hook backed by localStorage.
 * Syncs across components via a custom DOM event per key.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      const name = eventName(key);
      window.addEventListener(name, cb);
      return () => window.removeEventListener(name, cb);
    },
    () => readValue(key, defaultValue),
  );

  const setValue = useCallback(
    (update: T | ((prev: T) => T)) => {
      const next =
        typeof update === "function"
          ? (update as (prev: T) => T)(readValue(key, defaultValue))
          : update;
      localStorage.setItem(key, JSON.stringify(next));
      notifyLocalStorage(key);
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
