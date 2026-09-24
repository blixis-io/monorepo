import type { BlixisModule, ModuleMeta } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { ModuleValidationError } from '../errors.ts'
import { validateModuleGraph } from './graph.ts'

const mod = (meta: Partial<ModuleMeta> & { name: string }): BlixisModule => ({
  meta: { version: '1.0.0', ...meta },
})

function problems(modules: unknown[]): string[] {
  try {
    validateModuleGraph(modules)
  } catch (error) {
    if (error instanceof ModuleValidationError)
      return error.problems.map((p) => `[${p.module}] ${p.message}`)
    throw error
  }
  return []
}

describe('validateModuleGraph — ordering', () => {
  it('keeps registration order when there are no dependencies', () => {
    const order = validateModuleGraph([mod({ name: 'a' }), mod({ name: 'b' }), mod({ name: 'c' })])
    expect(order.map((m) => m.meta.name)).toEqual(['a', 'b', 'c'])
  })

  it('puts required packages and capability providers before consumers', () => {
    const order = validateModuleGraph([
      mod({ name: '@acme/seo', requiresCapabilities: ['blixis.content'] }),
      mod({
        name: '@blixis/content',
        capabilities: ['blixis.content'],
        requires: { '@blixis/spaces': '^1.0.0' },
      }),
      mod({ name: '@blixis/users' }),
      mod({ name: '@blixis/spaces' }),
    ])
    expect(order.map((m) => m.meta.name)).toEqual([
      '@blixis/users',
      '@blixis/spaces',
      '@blixis/content',
      '@acme/seo',
    ])
  })

  it('is stable across runs', () => {
    const input = [mod({ name: 'x', requires: { y: '*' } }), mod({ name: 'y' }), mod({ name: 'z' })]
    expect(validateModuleGraph(input).map((m) => m.meta.name)).toEqual(
      validateModuleGraph(input).map((m) => m.meta.name),
    )
  })
})

describe('validateModuleGraph — problems (§26)', () => {
  it('rejects factories passed instead of modules', () => {
    function content(): BlixisModule {
      return mod({ name: '@blixis/content' })
    }
    expect(problems([content])).toEqual([
      '[module #0] a module factory (content) was passed instead of a module; call it: content()',
    ])
  })

  it('rejects missing names, duplicates, and invalid versions', () => {
    expect(
      problems([
        { meta: { version: '1.0.0' } },
        mod({ name: 'a' }),
        mod({ name: 'a' }),
        mod({ name: 'b', version: '1.0' }),
      ]),
    ).toEqual([
      '[module #0] missing meta.name',
      '[a] is registered more than once (duplicate meta.name)',
      '[b] has an invalid meta.version "1.0" (expected semver, e.g. 1.2.3)',
    ])
  })

  it('rejects missing and incompatible required packages', () => {
    expect(
      problems([
        mod({ name: 'seo', requires: { content: '^2.0.0', missing: '^1.0.0', bad: 'latest' } }),
        mod({ name: 'content', version: '1.4.0' }),
        mod({ name: 'bad' }),
      ]),
    ).toEqual([
      '[seo] requires content@^2.0.0, but 1.4.0 is registered',
      '[seo] requires package missing (^1.0.0), which is not registered',
      '[seo] has an invalid version range "latest" for bad',
    ])
  })

  it('rejects missing and invalid capabilities', () => {
    expect(
      problems([
        mod({
          name: 'img',
          requiresCapabilities: ['blixis.assets'],
          capabilities: ['Bad Cap' as never],
        }),
      ]),
    ).toEqual([
      '[img] declares an invalid capability "Bad Cap" (expected "<namespace>.<name>")',
      '[img] requires capability blixis.assets, which no registered module provides',
    ])
  })

  it('rejects dependency cycles, naming the modules', () => {
    expect(
      problems([
        mod({ name: 'a', requires: { b: '*' } }),
        mod({ name: 'b', requiresCapabilities: ['acme.c'] }),
        mod({ name: 'c', capabilities: ['acme.c'], requires: { a: '*' } }),
      ]),
    ).toEqual(['[a] is part of a dependency cycle: a -> b -> c -> a'])
  })

  it('reports all problems in one error whose message names each module', () => {
    const error = (() => {
      try {
        validateModuleGraph([
          mod({ name: 'a', version: 'x' }),
          mod({ name: 'b', requires: { z: '*' } }),
        ])
      } catch (e) {
        return e
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(ModuleValidationError)
    expect((error as ModuleValidationError).code).toBe('MODULE_ERROR')
    expect((error as ModuleValidationError).message).toContain('[a]')
    expect((error as ModuleValidationError).message).toContain('[b]')
  })

  it('allows a module to provide a capability it also requires', () => {
    expect(
      problems([mod({ name: 'a', capabilities: ['acme.x'], requiresCapabilities: ['acme.x'] })]),
    ).toEqual([])
  })
})
