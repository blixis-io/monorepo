import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectSurface, relativeSpecifiers, renderSurface } from './surface.ts'

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'surface-'))
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), content)
  }
  return dir
}

describe('API surface', () => {
  it('follows the declarations reachable from exports, skipping internal files', () => {
    const dir = fixture({
      'package.json': JSON.stringify({ exports: { '.': { types: './dist/index.d.ts' } } }),
      'dist/index.d.ts':
        "export { a } from './a.ts'\nexport type { B } from './types/b.js'\n//# sourceMappingURL=index.d.ts.map",
      'dist/a.d.ts': "export declare function a(x: import('./types/b.js').B): void   ",
      'dist/types/b.d.ts': 'export interface B { readonly id: string }',
      'dist/internal/secret.d.ts': 'export declare const secret: 1',
    })
    const files = collectSurface(dir)
    expect(files.map((f) => f.file)).toEqual([
      'dist/a.d.ts',
      'dist/index.d.ts',
      'dist/types/b.d.ts',
    ])
    expect(files.find((f) => f.file === 'dist/index.d.ts')?.content).not.toContain(
      'sourceMappingURL',
    )
    expect(files.find((f) => f.file === 'dist/a.d.ts')?.content.endsWith('void')).toBe(true)
    expect(renderSurface('@x/y', files)).toContain('## `dist/types/b.d.ts`')
  })

  it('finds relative specifiers only', () => {
    expect(
      relativeSpecifiers(
        "import type { X } from 'hono'\nexport * from './a.js'\ntype T = import('../b.js').T",
      ),
    ).toEqual(['./a.js', '../b.js'])
  })
})
