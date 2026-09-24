import { describe, expect, it } from 'vitest'
import { extractImports } from './imports.ts'

describe('extractImports', () => {
  it('finds static, type-only, re-export, side-effect, and dynamic imports with line numbers', () => {
    const source = [
      "import a from 'a'",
      "import { b, c } from '@scope/b'",
      "import type { D } from './d.ts'",
      "export { e } from '../e.ts'",
      "export * from 'f'",
      "import 'g'",
      "const h = await import('h')",
      'import {',
      '  multi,',
      "} from 'multi-line'",
    ].join('\n')
    expect(extractImports(source)).toEqual([
      { specifier: 'a', line: 1 },
      { specifier: '@scope/b', line: 2 },
      { specifier: './d.ts', line: 3 },
      { specifier: '../e.ts', line: 4 },
      { specifier: 'f', line: 5 },
      { specifier: 'g', line: 6 },
      { specifier: 'h', line: 7 },
      { specifier: 'multi-line', line: 10 },
    ])
  })

  it('ignores imports inside comments and strings that are not imports', () => {
    const source = [
      "// import x from 'commented'",
      "/* import y from 'block' */",
      "const url = 'https://example.com/import'",
      "import z from 'real'",
    ].join('\n')
    expect(extractImports(source)).toEqual([{ specifier: 'real', line: 4 }])
  })

  it('ignores import-like text inside string literals', () => {
    const source = [`check("import 'fixture'")`, `const s = "import x from 'y'"`].join('\n')
    expect(extractImports(source)).toEqual([])
  })

  it('ignores dynamic imports with non-literal specifiers', () => {
    expect(extractImports('await import(name)')).toEqual([])
  })
})
