import type { StandardSchemaV1 } from './standard-schema.ts'

/** A field of a {@link struct}: a primitive kind, optional with `?`, or a list of allowed strings. */
export type FieldSpec = 'string' | 'string?' | 'int' | readonly string[]

type Output<S extends Readonly<Record<string, FieldSpec>>> = {
  readonly [K in keyof S as S[K] extends 'string?' ? never : K]: S[K] extends 'int'
    ? number
    : S[K] extends readonly (infer U extends string)[]
      ? U
      : string
} & { readonly [K in keyof S as S[K] extends 'string?' ? K : never]?: string | undefined }

/**
 * A dependency-free Standard Schema for flat event payloads (ADR 0016): an object with string,
 * optional string, integer, and enum fields. Unknown keys are dropped, like Zod objects do. Public
 * event definitions use it so their packages need no schema library.
 *
 * @example
 * const payload = struct({ spaceId: 'string', organizationId: 'string' })
 */
export function struct<const S extends Readonly<Record<string, FieldSpec>>>(
  spec: S,
): StandardSchemaV1<unknown, Output<S>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'blixis',
      validate(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value))
          return { issues: [{ message: 'Expected an object' }] }
        const input = value as Record<string, unknown>
        const output: Record<string, unknown> = {}
        const issues: StandardSchemaV1.Issue[] = []
        for (const [key, kind] of Object.entries(spec)) {
          const item = input[key]
          if (kind === 'string?') {
            if (item === undefined) continue
            if (typeof item !== 'string') issues.push({ message: 'Expected a string', path: [key] })
          } else if (kind === 'string') {
            if (typeof item !== 'string') issues.push({ message: 'Expected a string', path: [key] })
          } else if (kind === 'int') {
            if (!Number.isInteger(item))
              issues.push({ message: 'Expected an integer', path: [key] })
          } else if (!(typeof item === 'string' && kind.includes(item))) {
            issues.push({ message: `Expected one of ${kind.join(', ')}`, path: [key] })
          }
          output[key] = item
        }
        return issues.length > 0 ? { issues } : { value: output as Output<S> }
      },
    },
  }
}
