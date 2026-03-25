import { useSyncExternalStore } from "react";

type Listener = () => void;
type SetAction<T> = T | ((prev: T) => T);

interface ExternalStore<T> {
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

interface LocalStorageStore<T> extends ExternalStore<T> {
  key: string;
  /** Update in-memory state + localStorage without broadcasting. */
  setLocal(value: SetAction<T>): void;
  /** setLocal + same-origin BroadcastChannel (no cross-origin). */
  setBroadcast(value: SetAction<T>): void;
  /** Called by set() after same-origin broadcast. Wire to cross-origin transport. */
  onSet?: (key: string, value: T) => void;
}

const STORE_CHANNEL_NAME = "zamak:store";

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

  const inner = createExternalStore(readFromStorage());
  const channel = new BroadcastChannel(STORE_CHANNEL_NAME);

  channel.addEventListener("message", (e) => {
    if (e.data.key === key) {
      // Sender already wrote to localStorage (shared within same origin).
      // Only update in-memory state + notify subscribers.
      inner.set(e.data.value);
    }
  });

  const store: LocalStorageStore<T> = {
    ...inner,
    key,
    set(value) {
      store.setBroadcast(value);
      store.onSet?.(key, inner.get());
    },
    setBroadcast(value) {
      store.setLocal(value);
      channel.postMessage({ key, value: inner.get() });
    },
    setLocal(value) {
      inner.set(value);
      localStorage.setItem(key, JSON.stringify(inner.get()));
    },
  };
  return store;
}

export function useStore<T>(
  store: ExternalStore<T>,
): [T, ExternalStore<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return [value, store.set];
}
