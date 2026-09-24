/** A module specifier found in a source file, with its 1-based line number. */
export interface ImportRef {
  readonly specifier: string
  readonly line: number
}

// Static imports/exports must start a statement (line start or after `;`), so text such as
// "import 'x'" inside string literals (e.g. test fixtures) is not mistaken for an import.
const IMPORT_PATTERNS: readonly RegExp[] = [
  // import x from '...'; import { x } from '...'; import type { X } from '...'; export { x } from '...'; export * from '...'
  /(?:^|;)[ \t]*(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?)\s+from\s*['"]([^'"]+)['"]/gm,
  // side-effect import: import '...'
  /(?:^|;)[ \t]*import\s*['"]([^'"]+)['"]/gm,
  // dynamic import('...') with a string literal, not directly inside a string
  /(?<!['"`\w.])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

/** Replaces comments with whitespace of the same length so line numbers stay correct. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:'"`\\])\/\/[^\n]*/g,
      (m, prefix: string) => prefix + ' '.repeat(m.length - prefix.length),
    )
}

/**
 * Extracts static and dynamic import specifiers from TypeScript/JavaScript source.
 * Conservative by design: only string-literal specifiers are reported.
 */
export function extractImports(source: string): ImportRef[] {
  const code = stripComments(source)
  const found = new Map<number, ImportRef>()
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      const index = match.index + match[0].lastIndexOf(specifier)
      if (found.has(index)) continue
      const line = code.slice(0, index).split('\n').length
      found.set(index, { specifier, line })
    }
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, ref]) => ref)
}
