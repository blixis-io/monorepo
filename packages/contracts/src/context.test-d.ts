import { expectTypeOf, test } from 'vitest'
import type { Logger, RequestContext, TransactionScope } from './context.ts'
import type { MigrationDefinition } from './migrations.ts'

test('transaction scopes are opaque', () => {
  // @ts-expect-error a plain object is not a TransactionScope
  const scope: TransactionScope = {}
  void scope
})

test('logger children are loggers and fields cover §35', () => {
  const fields = {
    requestId: 'r',
    correlationId: 'c',
    tenantId: 't',
    spaceId: 's',
    actorId: 'user:1',
    module: '@blixis/content',
    eventType: 'entry.published',
    eventId: 'e',
    duration: 12,
    status: 200,
  }
  expectTypeOf<Logger['child']>().parameter(0).toExtend<object>()
  expectTypeOf(fields).toExtend<Parameters<Logger['info']>[1]>()
  expectTypeOf<ReturnType<Logger['child']>>().toEqualTypeOf<Logger>()
})

test('request context is transport-independent', () => {
  expectTypeOf<RequestContext['now']>().returns.toEqualTypeOf<Date>()
  expectTypeOf<keyof RequestContext>().toEqualTypeOf<
    'requestId' | 'correlationId' | 'actor' | 'tenant' | 'logger' | 'services' | 'now' | 'signal'
  >()
})

test('migrations carry no database client types', () => {
  expectTypeOf<MigrationDefinition['up']>().toEqualTypeOf<
    | string
    | ((db: { execute(sql: string, params?: readonly unknown[]): Promise<void> }) => Promise<void>)
  >()
})
