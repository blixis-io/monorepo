/** Error thrown when an internal invariant does not hold. Indicates a programming error, not bad input. */
export class InvariantError extends Error {
  override readonly name = 'InvariantError'
}

/**
 * Asserts that `condition` is truthy and narrows its type.
 * Use for internal invariants only — validate untrusted input with schemas instead.
 *
 * @throws {InvariantError} when the condition is falsy.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message)
  }
}

/**
 * Marks a code path as unreachable. Passing a value that is not `never` is a compile-time error,
 * which makes `switch` statements over discriminated unions exhaustive.
 *
 * @throws {InvariantError} if reached at runtime.
 */
export function assertNever(value: never, message = 'Unexpected value'): never {
  throw new InvariantError(`${message}: ${JSON.stringify(value)}`)
}
