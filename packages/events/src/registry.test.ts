import { defineEvent, type EventDefinition, ModuleError, subscribe } from '@blixis/contracts'
import { createBlixis, defineModule, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EVENT_REGISTRY, eventsModule } from './module.ts'
import { EventRegistry } from './registry.ts'

z.config({ jitless: true })
const published = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ entryId: z.string() }),
})
const publishedCopy = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ entryId: z.number() }),
})
const publishedV2 = defineEvent({
  type: 'entry.published',
  version: 2,
  delivery: 'transactional',
  schema: z.object({ entryId: z.string(), locale: z.string() }),
})

describe('EventRegistry', () => {
  it('registers definitions by type and version, sharing one definition across modules', () => {
    const registry = new EventRegistry()
    registry.register(published, '@acme/content')
    registry.register(published, '@acme/search')
    registry.register(publishedV2, '@acme/content')
    expect(registry.get('entry.published', 1)).toBe(published)
    expect(registry.get('entry.published', 2)).toBe(publishedV2)
    expect(registry.get('entry.published', 3)).toBeUndefined()
    expect(registry.list()).toHaveLength(2)
  })

  it('rejects a different definition for the same type and version, naming both modules', () => {
    const registry = new EventRegistry()
    registry.register(published, '@acme/content')
    expect(() => registry.register(publishedCopy, '@acme/search')).toThrowError(
      new ModuleError(
        '@acme/search',
        'defines event entry.published@1 differently from @acme/content; import the same definition',
      ),
    )
  })
})

describe('eventsModule registry', () => {
  const subscriber = (name: string, event: EventDefinition) =>
    defineModule({
      meta: { name, version: '1.0.0' },
      events: [subscribe(event, 'handler', async () => undefined)],
    })()

  it('registers subscription events at setup', async () => {
    const app = createBlixis({
      modules: [eventsModule(), subscriber('@acme/a', published as EventDefinition)],
      logger: noopLogger,
    })
    await app.ready()
    expect(app.services.get(EVENT_REGISTRY).get('entry.published', 1)).toBe(published)
  })

  it('fails startup when two modules subscribe to conflicting definitions', async () => {
    const app = createBlixis({
      modules: [
        eventsModule(),
        subscriber('@acme/a', published as EventDefinition),
        subscriber('@acme/b', publishedCopy as EventDefinition),
      ],
      logger: noopLogger,
    })
    await expect(app.ready()).rejects.toThrow(/differently from @acme\/a/)
  })
})
