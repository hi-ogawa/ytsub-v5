import { useSyncExternalStore } from "react";

type Listener = () => void;
type SetAction<T> = T | ((prev: T) => T);

export interface ExternalStore<T> {
  get(): T;
  set(value: SetAction<T>): void;
  subscribe(listener: Listener): () => void;
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

export function storeEventName(key: string) {
  return `zamak:store:${key}`;
}

export function createLocalStorageStore<T>(
  key: string,
  defaultValue: T,
): ExternalStore<T> {
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
    get: inner.get,
    set(value) {
      inner.set(value);
      localStorage.setItem(key, JSON.stringify(inner.get()));
      window.dispatchEvent(new Event(storeEventName(key)));
    },
    subscribe: inner.subscribe,
  };
}

export function useStore<T>(
  store: ExternalStore<T>,
): [T, ExternalStore<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return [value, store.set];
}
