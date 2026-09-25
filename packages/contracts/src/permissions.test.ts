import { describe, expect, it } from 'vitest'
import {
  type Actor,
  ANONYMOUS_ACTOR,
  AUTHORIZATION_SERVICE,
  actorId,
  definePermission,
  isAnonymousActor,
  isPermissionId,
  isSystemRoleKey,
  isUserActor,
  SYSTEM_ROLES,
} from './permissions.ts'
import { createServiceToken } from './services.ts'

describe('actors', () => {
  const actors: [Actor, string][] = [
    [{ type: 'user', userId: 'u1' }, 'user:u1'],
    [{ type: 'apiToken', tokenId: 't1', ownerId: 'u1', scopes: ['content.read'] }, 'apiToken:t1'],
    [
      {
        type: 'deliveryKey',
        keyId: 'k1',
        organizationId: 'o1',
        spaceId: 's1',
        kind: 'preview',
        environmentIds: null,
      },
      'deliveryKey:k1',
    ],
    [{ type: 'system', component: '@blixis/events.outbox' }, 'system:@blixis/events.outbox'],
    [ANONYMOUS_ACTOR, 'anonymous'],
  ]

  it.each(actors)('actorId(%o) is %s', (actor, id) => {
    expect(actorId(actor)).toBe(id)
  })

  it('narrows with guards', () => {
    expect(isUserActor({ type: 'user', userId: 'u' })).toBe(true)
    expect(isUserActor(ANONYMOUS_ACTOR)).toBe(false)
    expect(isAnonymousActor(ANONYMOUS_ACTOR)).toBe(true)
    expect(Object.isFrozen(ANONYMOUS_ACTOR)).toBe(true)
  })
})

describe('permissions', () => {
  it('validates permission ids', () => {
    for (const id of ['content.read', 'content.publish', 'spaces.settings.write', 'users.invite'])
      expect(isPermissionId(id)).toBe(true)
    for (const id of ['content', 'Content.read', 'a.b.c.d', 'content..read', '.read'])
      expect(isPermissionId(id)).toBe(false)
  })

  it('definePermission checks names and freezes', () => {
    const p = definePermission({ id: 'content.publish', description: 'Publish entries' })
    expect(Object.isFrozen(p)).toBe(true)
    expect(() => definePermission({ id: 'publish.' as never, description: 'x' })).toThrowError(
      TypeError,
    )
  })

  it('definePermission validates and freezes default roles', () => {
    const p = definePermission({
      id: 'content.publish',
      description: 'Publish entries',
      defaultRoles: ['admin', 'editor'],
    })
    expect(p.defaultRoles).toEqual(['admin', 'editor'])
    expect(Object.isFrozen(p.defaultRoles)).toBe(true)
    expect(() =>
      definePermission({
        id: 'content.publish',
        description: 'x',
        defaultRoles: ['member' as never],
      }),
    ).toThrowError(/unknown default roles: member/)
  })

  it('system roles', () => {
    expect(SYSTEM_ROLES).toEqual(['owner', 'admin', 'editor', 'viewer'])
    expect(isSystemRoleKey('viewer')).toBe(true)
    expect(isSystemRoleKey('member')).toBe(false)
  })

  it('AUTHORIZATION_SERVICE token has a stable identity', () => {
    expect(AUTHORIZATION_SERVICE.id).toBe(
      createServiceToken('@blixis/permissions.authorization').id,
    )
  })
})
