/**
 * A task that runs one at a time: starting it again aborts the run in
 * progress.
 */
export class RestartableTask {
  private controller?: AbortController;

  /**
   * Abort the previous run, and start a new one. Await each step of the run
   * through `step`, which throws once a later restart aborts `signal`.
   */
  restart() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return {
      step: createAbortableStep(controller.signal),
      signal: controller.signal,
    };
  }
}

// The awaited work itself still runs to the end. Only what follows the step is
// skipped.
function createAbortableStep(signal: AbortSignal) {
  return async <T>(promise: Promise<T>): Promise<T> => {
    const value = await promise;
    signal.throwIfAborted();
    return value;
  };
}
