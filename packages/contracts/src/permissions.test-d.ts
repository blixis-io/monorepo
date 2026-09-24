import { expectTypeOf, test } from 'vitest'
import type {
  Actor,
  AUTHORIZATION_SERVICE,
  AuthorizationService,
  PermissionId,
} from './permissions.ts'
import type { ServiceOf } from './services.ts'

test('actor union narrows by type', () => {
  const describe = (actor: Actor): string => {
    switch (actor.type) {
      case 'user':
        expectTypeOf(actor.userId).toBeString()
        return actor.userId
      case 'apiToken':
        expectTypeOf(actor.scopes).toEqualTypeOf<readonly PermissionId[]>()
        return actor.ownerId
      case 'deliveryKey':
        expectTypeOf(actor.kind).toEqualTypeOf<'delivery' | 'preview'>()
        return actor.spaceId
      case 'system':
        return actor.component
      case 'anonymous':
        // @ts-expect-error anonymous actors have no id
        return actor.userId
    }
  }
  expectTypeOf(describe).returns.toBeString()
})

test('permission ids are dotted', () => {
  expectTypeOf<'content.publish'>().toExtend<PermissionId>()
  expectTypeOf<'publish'>().not.toExtend<PermissionId>()
})

test('authorization token is typed', () => {
  expectTypeOf<ServiceOf<typeof AUTHORIZATION_SERVICE>>().toEqualTypeOf<AuthorizationService>()
})
