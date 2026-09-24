import { ValidationError, type ValidationIssue } from './errors.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'

export type { StandardSchemaV1 } from './standard-schema.ts'

/** Output type of a Standard Schema (e.g. a Zod schema). */
export type InferOutput<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>

/** Input type of a Standard Schema. */
export type InferInput<S extends StandardSchemaV1> = StandardSchemaV1.InferInput<S>

/** Options for {@link validate} and {@link validateSync}. */
export interface ValidateOptions {
  /** Message of the thrown `ValidationError`. Defaults to `"Validation failed"`. */
  readonly message?: string
}

/** Converts Standard Schema issues into Blixis `ValidationIssue`s with plain paths. */
export function toValidationIssues(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): ValidationIssue[] {
  return issues.map((issue) => {
    const path = (issue.path ?? []).map((segment) => {
      const key = typeof segment === 'object' && segment !== null ? segment.key : segment
      return typeof key === 'number' ? key : String(key)
    })
    const code = (issue as { code?: unknown }).code
    return typeof code === 'string'
      ? { path, message: issue.message, code }
      : { path, message: issue.message }
  })
}

function unwrap<S extends StandardSchemaV1>(
  result: StandardSchemaV1.Result<InferOutput<S>>,
  options: ValidateOptions,
): InferOutput<S> {
  if (result.issues !== undefined) {
    throw new ValidationError(
      options.message ?? 'Validation failed',
      toValidationIssues(result.issues),
    )
  }
  return result.value
}

/**
 * Validates `input` with any Standard Schema (Zod, Valibot, ArkType, …).
 *
 * @returns the schema's typed output (with defaults/transforms applied).
 * @throws {ValidationError} with normalised issues when validation fails.
 */
export async function validate<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
  options: ValidateOptions = {},
): Promise<InferOutput<S>> {
  const result = (await schema['~standard'].validate(input)) as StandardSchemaV1.Result<
    InferOutput<S>
  >
  return unwrap<S>(result, options)
}

/**
 * Synchronous variant of {@link validate} for schemas without async refinements.
 *
 * @throws {ValidationError} when validation fails.
 * @throws {TypeError} when the schema validates asynchronously — use {@link validate} instead.
 */
export function validateSync<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
  options: ValidateOptions = {},
): InferOutput<S> {
  const result = schema['~standard'].validate(input)
  if (result instanceof Promise) {
    throw new TypeError('Schema validates asynchronously; use validate() instead of validateSync()')
  }
  return unwrap<S>(result as StandardSchemaV1.Result<InferOutput<S>>, options)
}
