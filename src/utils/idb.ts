export type Store<T> = {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): void;
  delete(key: string): void;
};

export type StoreMap<S, K extends keyof S> = { [P in K]: Store<S[P]> };

// Returns a `transact` function over a database whose object stores are
// described by `S`, keyed by the names in `storeNames`.
export function createTransact<S>(options: {
  openDb: () => Promise<IDBDatabase>;
  storeNames: { [K in keyof S]: string };
}) {
  // Runs `fn` in one transaction and resolves after it completes. `fn` may
  // await requests on its stores, because a transaction stays active through
  // promise callbacks run from its request events.
  return async function transact<K extends keyof S & string, R>(
    names: K[],
    mode: IDBTransactionMode,
    fn: (stores: StoreMap<S, K>) => Promise<R>,
  ): Promise<R> {
    const db = await options.openDb();
    const tx = db.transaction(
      names.map((name) => options.storeNames[name]),
      mode,
    );
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
    });
    const stores = Object.fromEntries(
      names.map((name) => [
        name,
        wrapStore(tx.objectStore(options.storeNames[name])),
      ]),
    ) as StoreMap<S, K>;
    let result: R;
    try {
      result = await fn(stores);
    } catch (err) {
      done.catch(() => {});
      try {
        tx.abort();
      } catch {}
      throw err;
    }
    await done;
    return result;
  };
}

function wrapStore<T>(store: IDBObjectStore): Store<T> {
  return {
    get: (key) => requestResult(store.get(key)),
    getAll: () => requestResult(store.getAll()),
    put: (value) => {
      store.put(value);
    },
    delete: (key) => {
      store.delete(key);
    },
  };
}

function requestResult<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
