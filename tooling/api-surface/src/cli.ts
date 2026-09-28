#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { collectSurface, renderSurface } from './surface.ts'

/** Packages whose surface third-party modules depend on (ADR 0016). Build them first. */
const PUBLIC = [
  ['@blixis-io/contracts', 'packages/contracts', 'contracts'],
  ['@blixis-io/kernel', 'packages/kernel', 'kernel'],
  ['@blixis-io/content-api', 'packages/content-api', 'content-api'],
  ['@blixis-io/database', 'packages/database', 'database'],
] as const

const root = path.resolve(import.meta.dirname, '../../..')
const check = process.argv.includes('--check')
const outDir = path.join(root, 'docs/api-surface')
mkdirSync(outDir, { recursive: true })

const stale: string[] = []
for (const [name, dir, slug] of PUBLIC) {
  const rendered = renderSurface(name, collectSurface(path.join(root, dir)))
  const target = path.join(outDir, `${slug}.api.md`)
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {}
  if (current === rendered) continue
  if (check) stale.push(path.relative(root, target))
  else writeFileSync(target, rendered)
}

if (check && stale.length > 0) {
  console.error(
    `api-surface: the public API changed: ${stale.join(', ')}\nReview it, run \`pnpm api-surface:update\`, and commit the snapshots (breaking changes: feat(scope)!: with BREAKING CHANGE:).`,
  )
  process.exitCode = 1
} else
  console.log(check ? 'api-surface: up to date' : `api-surface: wrote ${PUBLIC.length} snapshots`)
