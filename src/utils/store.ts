export interface Store<State> {
  get(): State;
  subscribe(listener: () => void): () => void;
  update(update: Partial<State>): void;
}

export function createStore<State>(initialState: State): Store<State> {
  let state = initialState;
  const listeners = new Set<() => void>();

  const get = (): State => state;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const update = (update: Partial<State>): void => {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  };

  return { get, subscribe, update };
}
