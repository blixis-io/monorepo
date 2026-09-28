#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis-io/contracts'
import { buildDocument } from './document.ts'
import { emitSdkTypes } from './typescript.ts'

const root = path.resolve(import.meta.dirname, '../../..')
export const SPEC_PATH = path.join(root, 'apps/api/openapi.json')
export const SDK_TYPES_PATH = path.join(root, 'packages/sdk/src/generated/api.ts')

/** The SDK's generated types for a document. */
export const generateSdkTypes = (spec: string): string =>
  emitSdkTypes(JSON.parse(spec) as Record<string, unknown>)

/** The OpenAPI document of the API Worker's real module list, as committed text. */
export async function generateSpec(): Promise<string> {
  const config = path.join(root, 'apps/api/src/blixis.config.ts')
  const { modules } = (await import(pathToFileURL(config).href)) as {
    modules: readonly BlixisModule[]
  }
  const version = (
    JSON.parse(readFileSync(path.join(root, 'apps/api/package.json'), 'utf8')) as {
      version: string
    }
  ).version
  const document = buildDocument(modules, {
    title: 'Blixis Management API',
    version,
    description:
      'REST API for managing spaces, content, assets, and webhooks. Conventions: docs/api/management-conventions.md. Content delivery is GraphQL at /graphql.',
  })
  return `${JSON.stringify(document, null, 2)}\n`
}

async function main(args: readonly string[]): Promise<number> {
  const spec = await generateSpec()
  const types = generateSdkTypes(spec)
  const outputs: [string, string][] = [
    [SPEC_PATH, spec],
    [SDK_TYPES_PATH, types],
  ]
  if (args.includes('--check')) {
    const stale = outputs.filter(([file, text]) => {
      try {
        return readFileSync(file, 'utf8') !== text
      } catch {
        return true
      }
    })
    for (const [file] of stale)
      console.error(`${path.relative(root, file)} is out of date: run pnpm openapi:generate`)
    if (stale.length === 0) console.log('openapi: up to date')
    return stale.length === 0 ? 0 : 1
  }
  for (const [file, text] of outputs) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
    console.log(`openapi: wrote ${path.relative(root, file)}`)
  }
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      console.error(error)
      process.exitCode = 1
    },
  )
