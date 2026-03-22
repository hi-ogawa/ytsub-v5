import { useSyncExternalStore } from "react";

type Listener = () => void;
type SetAction<T> = T | ((prev: T) => T);

interface ExternalStore<T> {
  get(): T;
  set(value: SetAction<T>): void;
  subscribe(listener: Listener): () => void;
}

export interface LocalStorageStore<T> extends ExternalStore<T> {
  storageKey: string;
  /** Update in-memory state + localStorage without broadcasting. */
  setLocal(value: SetAction<T>): void;
}

export const STORE_CHANNEL_NAME = "zamak:store";

const storesByKey = new Map<string, { setLocal(value: unknown): void }>();

let _storeChannel: BroadcastChannel | undefined;
function getStoreChannel(): BroadcastChannel {
  if (!_storeChannel) {
    _storeChannel = new BroadcastChannel(STORE_CHANNEL_NAME);
    _storeChannel.addEventListener("message", (e) => {
      const { key, value } = e.data;
      storesByKey.get(key)?.setLocal(value);
    });
  }
  return _storeChannel;
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

  function setLocal(value: SetAction<T>) {
    inner.set(value);
    localStorage.setItem(key, JSON.stringify(inner.get()));
  }

  const store: LocalStorageStore<T> = {
    storageKey: key,
    get: inner.get,
    set(value) {
      setLocal(value);
      getStoreChannel().postMessage({ key, value: inner.get() });
    },
    setLocal,
    subscribe: inner.subscribe,
  };

  storesByKey.set(key, store as { setLocal(value: unknown): void });
  getStoreChannel(); // ensure listener is set up

  return store;
}

export function useStore<T>(
  store: ExternalStore<T>,
): [T, ExternalStore<T>["set"]] {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return [value, store.set];
}
