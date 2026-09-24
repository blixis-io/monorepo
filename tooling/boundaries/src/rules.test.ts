import { describe, expect, it } from 'vitest'
import {
  checkImports,
  checkPackages,
  findWorkspaceCycles,
  splitSpecifier,
  type WorkspacePackage,
} from './rules.ts'

function pkg(name: string, dir: string, deps: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name,
    dir,
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    exportPaths: ['.'],
    ...deps,
  }
}

const shared = pkg('@blixis/shared', 'packages/shared')
const kernel = pkg('@blixis/kernel', 'packages/kernel', {
  dependencies: { '@blixis/shared': 'workspace:*' },
})
const testing = pkg('@blixis/testing', 'packages/testing')
const cloudflare = pkg('@blixis/cloudflare', 'packages/cloudflare')
const content = pkg('@blixis/content', 'modules/content', {
  dependencies: { '@blixis/cloudflare': 'workspace:*', '@blixis/shared': 'workspace:*' },
  devDependencies: { '@blixis/testing': 'workspace:*' },
})
const sdk = pkg('@blixis/sdk', 'packages/sdk')
const admin = pkg('@blixis/admin', 'apps/admin', {
  dependencies: { '@blixis/sdk': 'workspace:*', '@blixis/shared': 'workspace:*' },
})
const all = [shared, kernel, testing, cloudflare, content, sdk, admin]

const rules = (path: string, content: string) =>
  checkImports(all, [{ path, content }]).map((v) => v.rule)

describe('splitSpecifier', () => {
  it('splits scoped and unscoped specifiers', () => {
    expect(splitSpecifier('@blixis/kernel')).toEqual({ name: '@blixis/kernel', subpath: '.' })
    expect(splitSpecifier('@blixis/kernel/src/x.ts')).toEqual({
      name: '@blixis/kernel',
      subpath: './src/x.ts',
    })
    expect(splitSpecifier('hono/utils')).toEqual({ name: 'hono', subpath: './utils' })
  })
})

describe('checkImports', () => {
  it('accepts public imports of declared workspace packages and in-package relative imports', () => {
    expect(
      rules('packages/kernel/src/a.ts', "import { x } from '@blixis/shared'\nimport './b.ts'"),
    ).toEqual([])
  })

  it('flags relative imports that leave the package', () => {
    expect(rules('packages/kernel/src/a.ts', "import '../../shared/src/assert.ts'")).toEqual([
      'relative-escape',
    ])
  })

  it('flags undeclared workspace imports', () => {
    expect(rules('packages/kernel/src/a.ts', "import { sdk } from '@blixis/sdk'")).toEqual([
      'undeclared-workspace-import',
    ])
  })

  it('flags non-exported subpaths', () => {
    expect(rules('packages/kernel/src/a.ts', "import '@blixis/shared/src/assert.ts'")).toEqual([
      'non-exported-subpath',
    ])
  })

  it('allows @blixis/testing only in test files', () => {
    expect(rules('modules/content/src/a.ts', "import '@blixis/testing'")).toEqual([
      'test-only-import',
    ])
    expect(rules('modules/content/src/a.test.ts', "import '@blixis/testing'")).toEqual([])
    expect(rules('modules/content/test/flow.test.ts', "import '@blixis/testing'")).toEqual([])
  })

  it('forbids modules from importing @blixis/cloudflare', () => {
    expect(rules('modules/content/src/a.ts', "import '@blixis/cloudflare'")).toEqual([
      'forbidden-edge',
    ])
  })

  it('restricts apps/admin to @blixis/sdk', () => {
    expect(rules('apps/admin/src/a.ts', "import '@blixis/sdk'")).toEqual([])
    expect(rules('apps/admin/src/a.ts', "import '@blixis/shared'")).toEqual(['forbidden-edge'])
  })

  it('ignores third-party packages', () => {
    expect(rules('packages/kernel/src/a.ts', "import { Hono } from 'hono'")).toEqual([])
  })

  it('reports file and line', () => {
    const [violation] = checkImports(all, [
      { path: 'packages/kernel/src/a.ts', content: "\n\nimport '@blixis/sdk'" },
    ])
    expect(violation).toMatchObject({ file: 'packages/kernel/src/a.ts', line: 3 })
  })
})

describe('findWorkspaceCycles', () => {
  it('returns no cycles for a DAG', () => {
    expect(findWorkspaceCycles(all)).toEqual([])
  })

  it('finds direct and indirect cycles once each', () => {
    const a = pkg('a', 'packages/a', { dependencies: { b: '*' } })
    const b = pkg('b', 'packages/b', { devDependencies: { c: '*' } })
    const c = pkg('c', 'packages/c', { peerDependencies: { a: '*' } })
    expect(findWorkspaceCycles([a, b, c])).toEqual([['a', 'b', 'c', 'a']])
  })
})

describe('checkPackages', () => {
  it('reports cycles and runtime dependencies of @blixis/contracts', () => {
    const contracts = pkg('@blixis/contracts', 'packages/contracts', {
      dependencies: { zod: '*' },
    })
    const x = pkg('x', 'packages/x', { dependencies: { y: '*' } })
    const y = pkg('y', 'packages/y', { dependencies: { x: '*' } })
    expect(checkPackages([contracts, x, y]).map((v) => v.rule)).toEqual([
      'workspace-cycle',
      'contracts-runtime-dependency',
    ])
  })
})
