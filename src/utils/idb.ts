export type Store<T> = {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): void;
  delete(key: string): void;
};

export type StoreMap<S, K extends keyof S> = { [P in K]: Store<S[P]> };

// Returns a `transact` function over a database whose object stores are
// described by `S`, keyed by the names in `storeNames`. The database opens on
// the first transaction.
export function createTransact<S>(options: {
  name: string;
  version: number;
  storeNames: { [K in keyof S]: string };
  upgrade: (
    db: IDBDatabase,
    oldVersion: number,
    transaction: IDBTransaction,
  ) => void;
}) {
  let dbPromise: Promise<IDBDatabase> | undefined;

  function openDb(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(options.name, options.version);
      request.onupgradeneeded = (event) =>
        options.upgrade(request.result, event.oldVersion, request.transaction!);
      request.onsuccess = () => {
        const db = request.result;
        // Let a newer version of the app upgrade the database.
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  // Runs `fn` in one transaction and resolves after it completes. `fn` may
  // await requests on its stores, because a transaction stays active through
  // promise callbacks run from its request events.
  return async function transact<K extends keyof S & string, R>(
    names: K[],
    mode: IDBTransactionMode,
    fn: (stores: StoreMap<S, K>) => Promise<R>,
  ): Promise<R> {
    const db = await openDb();
    const transaction = db.transaction(
      names.map((name) => options.storeNames[name]),
      mode,
    );
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Transaction aborted"));
    });
    const stores = Object.fromEntries(
      names.map((name) => [
        name,
        wrapStore(transaction.objectStore(options.storeNames[name])),
      ]),
    ) as StoreMap<S, K>;
    let result: R;
    try {
      result = await fn(stores);
    } catch (error) {
      done.catch(() => {});
      try {
        transaction.abort();
      } catch {}
      throw error;
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

function requestResult<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}
