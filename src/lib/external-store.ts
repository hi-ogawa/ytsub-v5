import { useSyncExternalStore } from "react";

type Listener = () => void;
type SetAction<T> = T | ((prev: T) => T);

interface ExternalStore<T> {
  get(): T;
  set(value: SetAction<T>): void;
  subscribe(listener: Listener): () => void;
}

interface LocalStorageStore<T> extends ExternalStore<T> {
  storageKey: string;
}

function createExternalStore<T>(initialValue: T): ExternalStore<T> {
  let current = initialValue;
  const listeners = new Set<Listener>();

  function notify() {
    for (const l of listeners) l();
  }

  return {
    get: () => current,
    set(value) {
      current =
        typeof value === "function"
          ? (value as (prev: T) => T)(current)
          : value;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const STORE_UPDATED_EVENT = "zamak:store-updated";

export function createLocalStorageStore<T>(
  key: string,
  defaultValue: T,
): LocalStorageStore<T> {
  function readFromStorage(): T {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  const inner = createExternalStore<T>(readFromStorage());
  return {
    ...inner,
    storageKey: key,
    set(value) {
      inner.set(value);
      localStorage.setItem(key, JSON.stringify(inner.get()));
      window.dispatchEvent(
        new CustomEvent(STORE_UPDATED_EVENT, { detail: key }),
      );
    },
  };
}

export function useStore<T>(
  store: ExternalStore<T>,
): [T, ExternalStore<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return [value, store.set];
}
