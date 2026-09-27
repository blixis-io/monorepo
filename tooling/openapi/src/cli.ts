#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis/contracts'
import { buildDocument } from './document.ts'

const root = path.resolve(import.meta.dirname, '../../..')
export const SPEC_PATH = path.join(root, 'apps/api/openapi.json')

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
  if (args.includes('--check')) {
    const committed = readFileSync(SPEC_PATH, 'utf8')
    if (committed !== spec) {
      console.error('apps/api/openapi.json is out of date: run pnpm openapi:generate')
      return 1
    }
    console.log('openapi: up to date')
    return 0
  }
  writeFileSync(SPEC_PATH, spec)
  console.log(`openapi: wrote ${path.relative(root, SPEC_PATH)}`)
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
