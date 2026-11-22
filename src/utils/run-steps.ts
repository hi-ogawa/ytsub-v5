type Step<Input, Output> = (input: Input) => Output | Promise<Output>;

/**
 * Run `steps` in order, passing each one's result to the next, and throw the
 * signal's reason after any step that finishes once `signal` has aborted. A
 * step that has started still runs to the end, so put what must not happen
 * after an abort, such as showing the result, in a later step or after this
 * returns.
 */
export async function runSteps<A>(
  signal: AbortSignal,
  steps: [Step<void, A>],
): Promise<A>;
export async function runSteps<A, B>(
  signal: AbortSignal,
  steps: [Step<void, A>, Step<A, B>],
): Promise<B>;
export async function runSteps<A, B, C>(
  signal: AbortSignal,
  steps: [Step<void, A>, Step<A, B>, Step<B, C>],
): Promise<C>;
export async function runSteps(
  signal: AbortSignal,
  steps: Step<never, unknown>[],
): Promise<unknown> {
  let value: unknown;
  for (const step of steps as Step<unknown, unknown>[]) {
    signal.throwIfAborted();
    value = await step(value);
  }
  signal.throwIfAborted();
  return value;
}
