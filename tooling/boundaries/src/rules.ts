import path from 'node:path'
import { extractImports } from './imports.ts'

/** A workspace package as seen by the checker. */
export interface WorkspacePackage {
  /** Package name from package.json, e.g. `@blixis/kernel`. */
  readonly name: string
  /** Directory relative to the repository root, e.g. `packages/kernel`. */
  readonly dir: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
  readonly peerDependencies: Readonly<Record<string, string>>
  /** Export subpaths from package.json `exports` (e.g. `.`, `./node.json`). */
  readonly exportPaths: readonly string[]
}

/** A source file belonging to a package. */
export interface SourceFile {
  /** Path relative to the repository root. */
  readonly path: string
  readonly content: string
}

export type RuleId =
  | 'relative-escape'
  | 'undeclared-workspace-import'
  | 'non-exported-subpath'
  | 'test-only-import'
  | 'forbidden-edge'
  | 'workspace-cycle'
  | 'contracts-runtime-dependency'
  | 'public-api-dependency'
  | 'plugin-internal-import'
  | 'role-name-check'

export interface Violation {
  readonly rule: RuleId
  readonly file: string
  readonly line?: number
  readonly message: string
}

/** Packages that may only be imported from test files. */
const TEST_ONLY_PACKAGES = new Set(['@blixis/testing'])

/** Workspace packages `apps/admin` may import (it is an API client, §50). */
const ADMIN_ALLOWED_WORKSPACE_IMPORTS = new Set(['@blixis/sdk'])

const TEST_FILE = /(\.test\.tsx?|\.test-d\.ts|\.worker\.test\.ts)$|(^|\/)test\//

function isTestFile(file: string): boolean {
  return TEST_FILE.test(file)
}

function declaredDependencies(pkg: WorkspacePackage): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.devDependencies),
    ...Object.keys(pkg.peerDependencies),
  ])
}

/** Splits a bare specifier into package name and subpath (`@a/b/c` → `@a/b`, `./c`). */
export function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/')
  const nameParts = specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)
  const rest = parts.slice(nameParts.length)
  return { name: nameParts.join('/'), subpath: rest.length === 0 ? '.' : `./${rest.join('/')}` }
}

/** Checks every import in the given files against the package-boundary rules. */
export function checkImports(
  packages: readonly WorkspacePackage[],
  files: readonly SourceFile[],
): Violation[] {
  const byName = new Map(packages.map((p) => [p.name, p]))
  const violations: Violation[] = []

  for (const file of files) {
    const owner = packages
      .filter((p) => file.path.startsWith(`${p.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0]
    if (owner === undefined) continue
    const declared = declaredDependencies(owner)

    for (const ref of extractImports(file.content)) {
      const at = { file: file.path, line: ref.line }

      if (ref.specifier.startsWith('.')) {
        const target = path.posix.normalize(
          path.posix.join(path.posix.dirname(file.path), ref.specifier),
        )
        if (!target.startsWith(`${owner.dir}/`)) {
          violations.push({
            rule: 'relative-escape',
            ...at,
            message: `'${ref.specifier}' leaves package ${owner.name}; import the other package by name`,
          })
        }
        continue
      }

      const { name, subpath } = splitSpecifier(ref.specifier)
      const target = byName.get(name)
      if (target === undefined) continue

      if (target.name !== owner.name && !declared.has(target.name)) {
        violations.push({
          rule: 'undeclared-workspace-import',
          ...at,
          message: `${owner.name} imports ${target.name} but does not declare it in package.json`,
        })
      }
      if (!target.exportPaths.includes(subpath)) {
        violations.push({
          rule: 'non-exported-subpath',
          ...at,
          message: `'${ref.specifier}' is not exported by ${target.name}; use its public entry`,
        })
      }
      if (TEST_ONLY_PACKAGES.has(target.name) && !isTestFile(file.path)) {
        violations.push({
          rule: 'test-only-import',
          ...at,
          message: `${target.name} may only be imported from test files`,
        })
      }
      if (owner.dir.startsWith('modules/') && target.name === '@blixis/cloudflare') {
        violations.push({
          rule: 'forbidden-edge',
          ...at,
          message:
            'domain modules must not depend on @blixis/cloudflare (bindings stay in adapters)',
        })
      }
      if (owner.dir === 'apps/admin' && !ADMIN_ALLOWED_WORKSPACE_IMPORTS.has(target.name)) {
        violations.push({
          rule: 'forbidden-edge',
          ...at,
          message: `apps/admin may only use @blixis/sdk from the workspace, not ${target.name}`,
        })
      }
    }
  }
  return violations
}

/** Finds dependency cycles between workspace packages (all dependency kinds). */
export function findWorkspaceCycles(packages: readonly WorkspacePackage[]): string[][] {
  const names = new Set(packages.map((p) => p.name))
  const edges = new Map(
    packages.map((p) => [p.name, [...declaredDependencies(p)].filter((d) => names.has(d)).sort()]),
  )
  const cycles: string[][] = []
  const seen = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  const visit = (name: string): void => {
    state.set(name, 'visiting')
    stack.push(name)
    for (const next of edges.get(name) ?? []) {
      if (state.get(next) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(next)), next]
        const key = [...cycle.slice(0, -1)].sort().join('>')
        if (!seen.has(key)) {
          seen.add(key)
          cycles.push(cycle)
        }
      } else if (!state.has(next)) {
        visit(next)
      }
    }
    stack.pop()
    state.set(name, 'done')
  }

  for (const name of [...names].sort()) {
    if (!state.has(name)) visit(name)
  }
  return cycles
}

/**
 * Public capability packages (ADR 0016): what third-party modules import instead of first-party
 * implementations. They may depend on `@blixis/contracts` only, as a peer.
 */
const PUBLIC_API_PACKAGES = new Set(['@blixis/content-api'])

/** Package-level rules that do not depend on source files. */
export function checkPackages(packages: readonly WorkspacePackage[]): Violation[] {
  const violations: Violation[] = findWorkspaceCycles(packages).map((cycle) => ({
    rule: 'workspace-cycle' as const,
    file: 'package.json',
    message: `workspace dependency cycle: ${cycle.join(' -> ')}`,
  }))
  const contracts = packages.find((p) => p.name === '@blixis/contracts')
  if (contracts !== undefined && Object.keys(contracts.dependencies).length > 0) {
    violations.push({
      rule: 'contracts-runtime-dependency',
      file: `${contracts.dir}/package.json`,
      message: `@blixis/contracts must have no runtime dependencies (§4); found: ${Object.keys(contracts.dependencies).join(', ')}`,
    })
  }
  for (const pkg of packages.filter((p) => PUBLIC_API_PACKAGES.has(p.name))) {
    const extra = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)].filter(
      (name) => name !== '@blixis/contracts',
    )
    if (extra.length > 0 || pkg.dependencies['@blixis/contracts'] !== undefined) {
      violations.push({
        rule: 'public-api-dependency',
        file: `${pkg.dir}/package.json`,
        message: `${pkg.name} may only peer-depend on @blixis/contracts (ADR 0016); found: ${[...new Set([...Object.keys(pkg.dependencies), ...extra])].join(', ')}`,
      })
    }
  }
  return violations
}

/**
 * The only package that may evaluate role names (roles are configuration, §30, plan 009), and
 * this checker, whose patterns describe them.
 */
const ROLE_EXEMPT_DIRS = ['modules/permissions/', 'tooling/boundaries/']
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/

const ROLE_NAME_CHECKS: readonly RegExp[] = [
  // role === 'admin', m.roleKey !== "owner", spaceRole == `editor`
  /\b\w*[rR]ole(?:Key)?\s*[!=]==?\s*['"`]/,
  // 'admin' === role
  /['"`]\s*[!=]==?\s*[\w.]*[rR]ole(?:Key)?\b/,
  // eq(memberships.roleKey, 'owner') and other query-builder comparisons
  /\b(?:eq|ne)\([\w.]*[rR]ole(?:Key)?\s*,\s*['"`]/,
  // ['owner', 'admin'].includes(role)
  /\[[^\]]*['"`](?:owner|admin|editor|viewer|member)['"`][^\]]*\]\.includes\(/,
]

/**
 * Forbids comparing role names outside `@blixis/permissions` (plan 009.004): code checks
 * permissions through `AUTHORIZATION_SERVICE`, never `role === 'admin'`. Tests are exempt.
 */
export function checkRoleNames(files: readonly SourceFile[]): Violation[] {
  const violations: Violation[] = []
  for (const file of files) {
    if (ROLE_EXEMPT_DIRS.some((dir) => file.path.startsWith(dir)) || isTestFile(file.path)) continue
    file.content.split('\n').forEach((text, index) => {
      if (!COMMENT.test(text) && ROLE_NAME_CHECKS.some((pattern) => pattern.test(text))) {
        violations.push({
          rule: 'role-name-check',
          file: file.path,
          line: index + 1,
          message:
            'compares a role name; check a permission with AUTHORIZATION_SERVICE instead (roles are evaluated only by @blixis/permissions)',
        })
      }
    })
  }
  return violations
}

/**
 * Packages third-party modules may import (§25, ADR 0016): the public contracts, the kernel's
 * `defineModule`, public capability packages, and the database toolkit for modules that store data.
 */
export const PLUGIN_PUBLIC_PACKAGES: ReadonlySet<string> = new Set([
  '@blixis/contracts',
  '@blixis/kernel',
  '@blixis/content-api',
  '@blixis/database',
])

/**
 * Example plugins (`examples/*`, outside the workspace) prove the extension contract (§42 Stage 8):
 * their source may import only public Blixis packages, and never reach into other directories.
 * Their tests may boot first-party modules.
 */
export function checkPluginImports(files: readonly SourceFile[]): Violation[] {
  const violations: Violation[] = []
  for (const file of files) {
    const [, plugin, area] = file.path.split('/')
    if (plugin === undefined || area !== 'src') continue
    for (const ref of extractImports(file.content)) {
      const at = { file: file.path, line: ref.line }
      if (ref.specifier.startsWith('@blixis/')) {
        const name = ref.specifier.split('/').slice(0, 2).join('/')
        if (!PLUGIN_PUBLIC_PACKAGES.has(name))
          violations.push({
            rule: 'plugin-internal-import',
            ...at,
            message: `${ref.specifier} is not a public package: plugins use ${[...PLUGIN_PUBLIC_PACKAGES].join(', ')}`,
          })
        else if (ref.specifier !== name)
          violations.push({
            rule: 'plugin-internal-import',
            ...at,
            message: `deep import ${ref.specifier}`,
          })
      } else if (ref.specifier.startsWith('.')) {
        const target = path.posix.normalize(
          path.posix.join(path.posix.dirname(file.path), ref.specifier),
        )
        if (!target.startsWith(`examples/${plugin}/src/`))
          violations.push({
            rule: 'plugin-internal-import',
            ...at,
            message: `${ref.specifier} leaves the plugin's src`,
          })
      }
    }
  }
  return violations
}
