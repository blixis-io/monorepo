import { definePermission, ModuleError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { defineModule } from '@blixis/kernel'
import { asAnonymous, asApiToken, asUser, createTestBlixis } from '@blixis/testing'
import { usersModule } from '@blixis/users'
import { describe, expect, it } from 'vitest'
import { PERMISSION_CATALOG, permissionsModule } from '../src/index.ts'

const blogModule = defineModule({
  meta: { name: '@acme/blog', version: '1.0.0' },
  permissions: [
    definePermission({
      id: 'blog.posts.read',
      description: 'Read posts',
      defaultRoles: ['viewer'],
    }),
    definePermission({
      id: 'blog.settings.write',
      description: 'Change blog settings',
      scope: 'organization',
    }),
  ],
})

async function setup() {
  return createTestBlixis({
    modules: [databaseModule(), eventsModule(), usersModule(), permissionsModule(), blogModule()],
  })
}

describe('permission catalog', () => {
  it('lists every declared permission with its module and scope (space by default)', async () => {
    const t = await setup()
    const catalog = t.services.get(PERMISSION_CATALOG)
    expect(catalog.list().map((p) => [p.id, p.module, p.scope])).toEqual([
      ['roles.read', '@blixis/permissions', 'organization'],
      ['roles.manage', '@blixis/permissions', 'organization'],
      ['blog.posts.read', '@acme/blog', 'space'],
      ['blog.settings.write', '@acme/blog', 'organization'],
    ])
    expect(catalog.get('blog.posts.read')?.description).toBe('Read posts')
    expect(catalog.get('blog.posts.delete')).toBeUndefined()
    expect(catalog.assertKnown('blog.posts.read').module).toBe('@acme/blog')
  })

  it('treats unknown permission ids as programming errors', async () => {
    const catalog = (await setup()).services.get(PERMISSION_CATALOG)
    expect(() => catalog.assertKnown('blog.post.read')).toThrow(ModuleError)
    expect(() => catalog.assertKnown('blog.post.read')).toThrow(
      /Unknown permission "blog.post.read"/,
    )
  })

  it('GET /api/v1/permissions groups the catalog by module for signed-in actors', async () => {
    const t = await setup()
    for (const actor of [asUser('user-1'), asApiToken('user-1')]) {
      const response = await t.request('/api/v1/permissions', { actor })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        modules: [
          {
            module: '@blixis/permissions',
            permissions: [
              {
                id: 'roles.read',
                description: "View the organization's roles and their permissions",
                scope: 'organization',
                defaultRoles: ['admin', 'editor', 'viewer'],
              },
              {
                id: 'roles.manage',
                description: 'Create, change, and delete custom roles',
                scope: 'organization',
                defaultRoles: ['admin'],
              },
            ],
          },
          {
            module: '@acme/blog',
            permissions: [
              {
                id: 'blog.posts.read',
                description: 'Read posts',
                scope: 'space',
                defaultRoles: ['viewer'],
              },
              {
                id: 'blog.settings.write',
                description: 'Change blog settings',
                scope: 'organization',
                defaultRoles: [],
              },
            ],
          },
        ],
      })
    }
    expect((await t.request('/api/v1/permissions', { actor: asAnonymous() })).status).toBe(401)
  })
})
