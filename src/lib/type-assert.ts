// Canonical type equality check from type-challenges.
// Uses generic function signature trick to bypass structural assignability
// and check internal type identity. Unlike [T] extends [U], this correctly
// distinguishes Record<string, unknown> from { key?: boolean }.
type Equal<T, U> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
    ? true
    : false;

/** Compile-time assertion that T and U are the exact same type. */
export function assertType<T, U>(_: Equal<T, U> extends true ? true : never) {
  // no-op at runtime
}
