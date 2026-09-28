import { describe, expect, it } from 'vitest'
import {
  checkImports,
  checkPackages,
  checkPluginImports,
  checkRoleNames,
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

const shared = pkg('@blixis-io/shared', 'packages/shared')
const kernel = pkg('@blixis-io/kernel', 'packages/kernel', {
  dependencies: { '@blixis-io/shared': 'workspace:*' },
})
const testing = pkg('@blixis-io/testing', 'packages/testing')
const cloudflare = pkg('@blixis-io/cloudflare', 'packages/cloudflare')
const content = pkg('@blixis-io/content', 'modules/content', {
  dependencies: { '@blixis-io/cloudflare': 'workspace:*', '@blixis-io/shared': 'workspace:*' },
  devDependencies: { '@blixis-io/testing': 'workspace:*' },
})
const sdk = pkg('@blixis-io/sdk', 'packages/sdk')
const admin = pkg('@blixis-io/admin', 'apps/admin', {
  dependencies: { '@blixis-io/sdk': 'workspace:*', '@blixis-io/shared': 'workspace:*' },
})
const all = [shared, kernel, testing, cloudflare, content, sdk, admin]

const rules = (path: string, content: string) =>
  checkImports(all, [{ path, content }]).map((v) => v.rule)

describe('splitSpecifier', () => {
  it('splits scoped and unscoped specifiers', () => {
    expect(splitSpecifier('@blixis-io/kernel')).toEqual({ name: '@blixis-io/kernel', subpath: '.' })
    expect(splitSpecifier('@blixis-io/kernel/src/x.ts')).toEqual({
      name: '@blixis-io/kernel',
      subpath: './src/x.ts',
    })
    expect(splitSpecifier('hono/utils')).toEqual({ name: 'hono', subpath: './utils' })
  })
})

describe('checkImports', () => {
  it('accepts public imports of declared workspace packages and in-package relative imports', () => {
    expect(
      rules('packages/kernel/src/a.ts', "import { x } from '@blixis-io/shared'\nimport './b.ts'"),
    ).toEqual([])
  })

  it('flags relative imports that leave the package', () => {
    expect(rules('packages/kernel/src/a.ts', "import '../../shared/src/assert.ts'")).toEqual([
      'relative-escape',
    ])
  })

  it('flags undeclared workspace imports', () => {
    expect(rules('packages/kernel/src/a.ts', "import { sdk } from '@blixis-io/sdk'")).toEqual([
      'undeclared-workspace-import',
    ])
  })

  it('flags non-exported subpaths', () => {
    expect(rules('packages/kernel/src/a.ts', "import '@blixis-io/shared/src/assert.ts'")).toEqual([
      'non-exported-subpath',
    ])
  })

  it('allows @blixis-io/testing only in test files', () => {
    expect(rules('modules/content/src/a.ts', "import '@blixis-io/testing'")).toEqual([
      'test-only-import',
    ])
    expect(rules('modules/content/src/a.test.ts', "import '@blixis-io/testing'")).toEqual([])
    expect(rules('modules/content/test/flow.test.ts', "import '@blixis-io/testing'")).toEqual([])
  })

  it('forbids modules from importing @blixis-io/cloudflare', () => {
    expect(rules('modules/content/src/a.ts', "import '@blixis-io/cloudflare'")).toEqual([
      'forbidden-edge',
    ])
  })

  it('restricts apps/admin to @blixis-io/sdk', () => {
    expect(rules('apps/admin/src/a.ts', "import '@blixis-io/sdk'")).toEqual([])
    expect(rules('apps/admin/src/a.ts', "import '@blixis-io/shared'")).toEqual(['forbidden-edge'])
  })

  it('ignores third-party packages', () => {
    expect(rules('packages/kernel/src/a.ts', "import { Hono } from 'hono'")).toEqual([])
  })

  it('reports file and line', () => {
    const [violation] = checkImports(all, [
      { path: 'packages/kernel/src/a.ts', content: "\n\nimport '@blixis-io/sdk'" },
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
  it('reports cycles and runtime dependencies of @blixis-io/contracts', () => {
    const contracts = pkg('@blixis-io/contracts', 'packages/contracts', {
      dependencies: { zod: '*' },
    })
    const x = pkg('x', 'packages/x', { dependencies: { y: '*' } })
    const y = pkg('y', 'packages/y', { dependencies: { x: '*' } })
    expect(checkPackages([contracts, x, y]).map((v) => v.rule)).toEqual([
      'workspace-cycle',
      'contracts-runtime-dependency',
    ])
  })
  it('keeps public API packages on @blixis-io/contracts alone (ADR 0016)', () => {
    const ok = pkg('@blixis-io/content-api', 'packages/content-api', {
      peerDependencies: { '@blixis-io/contracts': '*' },
    })
    expect(checkPackages([ok])).toEqual([])
    const heavy = pkg('@blixis-io/content-api', 'packages/content-api', {
      dependencies: { zod: '*' },
      peerDependencies: { '@blixis-io/contracts': '*', '@blixis-io/content': '*' },
    })
    expect(checkPackages([heavy]).map((v) => v.message)).toEqual([
      '@blixis-io/content-api may only peer-depend on @blixis-io/contracts (ADR 0016); found: zod, @blixis-io/content',
    ])
  })
})

describe('checkRoleNames', () => {
  const file = (path: string, content: string) => ({ path, content })

  it('flags role-name comparisons outside @blixis-io/permissions', () => {
    const offenders = [
      "if (role === 'admin') return",
      'if (membership.roleKey !== "owner") throw error',
      "const ok = 'owner' == access.organizationRole",
      "where(eq(memberships.roleKey, 'owner'))",
      "const manager = ['owner', 'admin'].includes(role)",
    ]
    const violations = checkRoleNames([file('modules/spaces/src/a.ts', offenders.join('\n'))])
    expect(violations.map((v) => [v.rule, v.line])).toEqual(
      offenders.map((_, i) => ['role-name-check', i + 1]),
    )
  })

  it('allows permissions, constants, the permissions module, and tests', () => {
    expect(
      checkRoleNames([
        file('modules/spaces/src/a.ts', "await authz.require({ action: 'spaces.delete' })"),
        file('modules/users/src/b.ts', 'if (row.roleKey === OWNER_ROLE) await assertOwner()'),
        file('modules/permissions/src/c.ts', "if (key === 'owner') return all"),
        file('modules/spaces/test/d.test.ts', "expect(role === 'admin').toBe(true)"),
        file('modules/spaces/src/e.ts', "  // never write role === 'admin'"),
      ]),
    ).toEqual([])
  })
})

describe('checkPluginImports', () => {
  const file = (path: string, content: string) => ({ path, content })

  it('allows public packages, third-party packages, and files inside src', () => {
    const ok = [
      "import { defineModule } from '@blixis-io/kernel'",
      "import { CONTENT_SERVICE } from '@blixis-io/content-api'",
      "import { z } from 'zod'",
      "import { seo } from './service.ts'",
    ].join('\n')
    expect(checkPluginImports([file('examples/seo/src/index.ts', ok)])).toEqual([])
  })

  it('flags first-party implementations, deep imports, and escapes; tests are free', () => {
    const bad = [
      "import { contentModule } from '@blixis-io/content'",
      "import { x } from '@blixis-io/contracts/src/module.ts'",
      "import { y } from '../../../modules/content/src/index.ts'",
    ].join('\n')
    expect(checkPluginImports([file('examples/seo/src/index.ts', bad)]).map((v) => v.line)).toEqual(
      [1, 2, 3],
    )
    expect(checkPluginImports([file('examples/seo/test/seo.test.ts', bad)])).toEqual([])
  })
})
