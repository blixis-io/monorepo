import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis/contracts'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { generateSpec, SPEC_PATH } from '../src/cli.ts'
import { collectOperations } from '../src/document.ts'

const root = path.resolve(import.meta.dirname, '../../..')
const loadModules = async () =>
  (
    (await import(pathToFileURL(path.join(root, 'apps/api/src/blixis.config.ts')).href)) as {
      modules: readonly BlixisModule[]
    }
  ).modules

type Doc = {
  paths: Record<string, Record<string, { operationId: string; responses: object }>>
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> }
}

describe('OpenAPI document (ADR 0015)', () => {
  it('describes every route the API registers, and nothing else', async () => {
    const modules = await loadModules()
    const registered = new Set(
      createBlixis({ modules, logger: noopLogger })
        .hono.routes.filter((r) => r.method !== 'ALL')
        .map((r) => `${r.method} ${r.path}`),
    )
    const described = new Set([
      'GET /api/v1/health',
      'GET /api/v1/health/ready',
      ...collectOperations(modules).map((op) => `${op.method} ${op.route}`),
    ])
    expect([...registered].filter((route) => !described.has(route)).sort()).toEqual([])
    expect([...described].filter((route) => !registered.has(route)).sort()).toEqual([])
  })

  it('is committed up to date (pnpm openapi:generate)', async () => {
    expect(readFileSync(SPEC_PATH, 'utf8')).toBe(await generateSpec())
  })

  it('has unique operation ids and resolvable references', async () => {
    const doc = JSON.parse(await generateSpec()) as Doc
    const ids = Object.values(doc.paths).flatMap((ops) =>
      Object.values(ops).map((op) => op.operationId),
    )
    expect(new Set(ids).size).toBe(ids.length)
    const text = JSON.stringify(doc)
    const refs = [...text.matchAll(/"\$ref":"#\/components\/(schemas|responses)\/([^"]+)"/g)]
    expect(refs.length).toBeGreaterThan(50)
    for (const [, kind, name] of refs)
      expect(doc.components[kind as 'schemas' | 'responses'], `${kind}/${name}`).toHaveProperty(
        name as string,
      )
    expect(text).not.toContain('__slot')
  })
})
