import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { SourceFile, WorkspacePackage } from './rules.ts'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'])
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.wrangler', '.turbo'])

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  exports?: string | Record<string, unknown>
}

/** Reads the `packages:` globs from pnpm-workspace.yaml (supports `dir/*` entries only). */
export function readWorkspaceGlobs(root: string): string[] {
  const yaml = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
  const globs: string[] = []
  let inPackages = false
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages) {
      const item = /^\s+-\s+['"]?([^'"]+)['"]?$/.exec(line)
      if (item?.[1] !== undefined) globs.push(item[1])
      else if (line !== '' && !/^\s/.test(line)) inPackages = false
    }
  }
  return globs
}

function exportPaths(pkg: PackageJson): string[] {
  if (pkg.exports === undefined) return ['.']
  if (typeof pkg.exports === 'string') return ['.']
  const keys = Object.keys(pkg.exports)
  return keys.every((k) => k.startsWith('.')) ? keys : ['.']
}

/** Loads all workspace packages matched by the workspace globs. */
export function loadPackages(root: string): WorkspacePackage[] {
  const packages: WorkspacePackage[] = []
  for (const glob of readWorkspaceGlobs(root)) {
    if (!glob.endsWith('/*')) throw new Error(`unsupported workspace glob: ${glob}`)
    const base = glob.slice(0, -2)
    let entries: string[]
    try {
      entries = readdirSync(path.join(root, base))
    } catch {
      continue
    }
    for (const entry of entries.sort()) {
      const manifest = path.join(root, base, entry, 'package.json')
      let json: PackageJson
      try {
        json = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson
      } catch {
        continue
      }
      if (json.name === undefined) continue
      packages.push({
        name: json.name,
        dir: `${base}/${entry}`,
        dependencies: json.dependencies ?? {},
        devDependencies: json.devDependencies ?? {},
        peerDependencies: json.peerDependencies ?? {},
        exportPaths: exportPaths(json),
      })
    }
  }
  return packages
}

/** Collects source files of all packages (skipping build output and dependencies). */
export function loadSourceFiles(root: string, packages: readonly WorkspacePackage[]): SourceFile[] {
  const files: SourceFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(path.join(root, dir)).sort()) {
      if (SKIPPED_DIRS.has(entry) || entry.startsWith('.')) continue
      const rel = `${dir}/${entry}`
      const stats = statSync(path.join(root, rel))
      if (stats.isDirectory()) walk(rel)
      else if (SOURCE_EXTENSIONS.has(path.extname(entry)) && !entry.endsWith('.d.ts')) {
        files.push({ path: rel, content: readFileSync(path.join(root, rel), 'utf8') })
      }
    }
  }
  for (const pkg of packages) walk(pkg.dir)
  return files
}
