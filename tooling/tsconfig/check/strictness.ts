// Smoke check for the shared presets: this file must type-check under base.json.
// It relies on settings from ADR 0001 (strict, exactOptionalPropertyTypes,
// noUncheckedIndexedAccess, verbatimModuleSyntax, .ts import specifiers).
import type { Options } from './types.ts'

export function pick(values: readonly string[], index: number): string | undefined {
  // noUncheckedIndexedAccess: element access is `string | undefined`
  return values[index]
}

export function withDefaults(options: Options): Required<Options> {
  // exactOptionalPropertyTypes: `title` may be absent but never `undefined`
  return { title: options.title ?? 'Untitled' }
}
