/**
 * Make `step`, which resolves like the promise it's given and then throws if
 * `signal` has aborted meanwhile. The awaited work itself still runs to the
 * end.
 */
export function createAbortableStep(signal: AbortSignal) {
  return async <T>(promise: Promise<T>): Promise<T> => {
    const value = await promise;
    signal.throwIfAborted();
    return value;
  };
}
