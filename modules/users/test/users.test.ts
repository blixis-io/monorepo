import { ConflictError, NotFoundError, ValidationError } from '@blixis/contracts'
import { DATABASE, databaseModule, toTransactionScope, withTransaction } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { asAnonymous, asApiToken, asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { USER_SERVICE, type User, type UserService, usersModule } from '../src/index.ts'

describe.skipIf(!databaseTestsEnabled())('users module', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [databaseModule(), eventsModule(), usersModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [databaseModule(), events.module(), usersModule()],
      database: db,
    })
    const users = <T>(fn: (service: UserService) => Promise<T>) =>
      t.app.runInScope({}, async ({ services }) => fn(services.get(USER_SERVICE)))
    return { t, events, users }
  }

  describe('UserService', () => {
    it('creates users with normalized emails and emits user.created', async () => {
      const { users, events } = await setup()
      const user = await users((s) => s.create({ email: ' Ada@Example.com ', displayName: 'Ada' }))
      expect(user).toMatchObject({ email: 'ada@example.com', displayName: 'Ada', status: 'active' })
      expect(events.expectEvent('user.created').payload).toEqual({
        userId: user.id,
        email: 'ada@example.com',
        displayName: 'Ada',
      })
      expect(await users((s) => s.findByEmail('ADA@example.com'))).toEqual(user)
    })

    it('rejects duplicate emails regardless of case, and invalid input', async () => {
      const { users } = await setup()
      await users((s) => s.create({ email: 'grace@example.com', displayName: 'Grace' }))
      await expect(
        users((s) => s.create({ email: 'GRACE@example.com', displayName: 'G' })),
      ).rejects.toThrowError(new ConflictError('A user with this email already exists'))
      await expect(
        users((s) => s.create({ email: 'nope', displayName: 'x' })),
      ).rejects.toBeInstanceOf(ValidationError)
    })

    it('creates inside a caller transaction and rolls back with it', async () => {
      const { t, events } = await setup()
      await expect(
        t.app.runInScope({}, async ({ services }) =>
          withTransaction(services.get(DATABASE), async (tx) => {
            await services
              .get(USER_SERVICE)
              .create(
                { email: 'tx@example.com', displayName: 'Tx' },
                { transaction: toTransactionScope(tx) },
              )
            throw new Error('abort sign-up')
          }),
        ),
      ).rejects.toThrow('abort sign-up')
      await t.app.runInScope({}, async ({ services }) => {
        expect(await services.get(USER_SERVICE).findByEmail('tx@example.com')).toBeUndefined()
      })
      // captureEvents records at emit time; in production the outbox row rolls back with the transaction.
      expect(events.emitted.map((e) => e.type)).toEqual(['user.created'])
    })

    it('updates profiles and disables users with user.updated events', async () => {
      const { users, events } = await setup()
      const user = await users((s) => s.create({ email: 'lin@example.com', displayName: 'Lin' }))
      expect(
        (await users((s) => s.updateProfile(user.id, { displayName: ' Lin Y ' }))).displayName,
      ).toBe('Lin Y')
      expect((await users((s) => s.disable(user.id))).status).toBe('disabled')
      expect(events.emitted.filter((e) => e.type === 'user.updated').map((e) => e.payload)).toEqual(
        [
          { userId: user.id, changed: ['displayName'] },
          { userId: user.id, changed: ['status'] },
        ],
      )
      expect(events.expectEvent('user.disabled').payload).toEqual({ userId: user.id })
      await expect(
        users((s) => s.getById('0199a3f2-7c1e-7b3a-9f10-6d2c5e8a41b0')),
      ).rejects.toBeInstanceOf(NotFoundError)
    })
  })

  describe('REST /api/v1/users/me', () => {
    it('returns and updates the signed-in user', async () => {
      const { t, users } = await setup()
      const user = await users((s) => s.create({ email: 'me@example.com', displayName: 'Me' }))
      const me = await t.request('/api/v1/users/me', { actor: asUser(user.id) })
      expect(me.status).toBe(200)
      expect(((await me.json()) as User).email).toBe('me@example.com')
      const patched = await t.request('/api/v1/users/me', {
        method: 'PATCH',
        actor: asUser(user.id),
        json: { displayName: 'New' },
      })
      expect(((await patched.json()) as User).displayName).toBe('New')
      const viaToken = await t.request('/api/v1/users/me', { actor: asApiToken(user.id, []) })
      expect(viaToken.status).toBe(200)
    })

    it('rejects anonymous callers with 401 and invalid input with 400', async () => {
      const { t, users } = await setup()
      const user = await users((s) => s.create({ email: 'v@example.com', displayName: 'V' }))
      expect((await t.request('/api/v1/users/me', { actor: asAnonymous() })).status).toBe(401)
      const bad = await t.request('/api/v1/users/me', {
        method: 'PATCH',
        actor: asUser(user.id),
        json: { displayName: '' },
      })
      expect(bad.status).toBe(400)
    })
  })

  describe('REST /api/v1/users/me/preferences', () => {
    const theme = {
      name: 'Violet',
      preset: 'violet-bloom',
      light: {
        primary: '#7033ff',
        'font-sans': '"Plus Jakarta Sans", sans-serif',
        radius: '0.5rem',
      },
      dark: { primary: 'oklch(0.7 0.2 290)', 'shadow-color': 'hsl(0 0% 0% / 0.1)' },
    }

    it('returns defaults, then saves and returns the theme per user', async () => {
      const { t, users } = await setup()
      const ada = await users((s) => s.create({ email: 'ada@example.com', displayName: 'Ada' }))
      const bob = await users((s) => s.create({ email: 'bob@example.com', displayName: 'Bob' }))
      const get = (id: string) => t.request('/api/v1/users/me/preferences', { actor: asUser(id) })

      expect(await (await get(ada.id)).json()).toEqual({ colorScheme: 'system', theme: null })
      const put = await t.request('/api/v1/users/me/preferences', {
        method: 'PUT',
        actor: asUser(ada.id),
        json: { colorScheme: 'dark', theme },
      })
      expect(put.status).toBe(200)
      expect(await put.json()).toEqual({ colorScheme: 'dark', theme })
      expect(await (await get(ada.id)).json()).toEqual({ colorScheme: 'dark', theme })
      expect(await (await get(bob.id)).json()).toEqual({ colorScheme: 'system', theme: null })

      // PUT replaces: omitted fields reset.
      await t.request('/api/v1/users/me/preferences', {
        method: 'PUT',
        actor: asUser(ada.id),
        json: { colorScheme: 'light' },
      })
      expect(await (await get(ada.id)).json()).toEqual({ colorScheme: 'light', theme: null })
    })

    it('rejects token values that could load resources or break out of a declaration', async () => {
      const { t, users } = await setup()
      const user = await users((s) => s.create({ email: 'x@example.com', displayName: 'X' }))
      for (const value of [
        'url(https://evil.example/x.png)',
        'red; background: blue',
        'red } body { display: none',
        'image-set("x.png" 1x)',
        '<script>',
        'x'.repeat(201),
      ]) {
        const response = await t.request('/api/v1/users/me/preferences', {
          method: 'PUT',
          actor: asUser(user.id),
          json: { theme: { ...theme, light: { primary: value } } },
        })
        expect(response.status, value).toBe(400)
      }
      const badName = await t.request('/api/v1/users/me/preferences', {
        method: 'PUT',
        actor: asUser(user.id),
        json: { theme: { ...theme, dark: { 'Primary;': '#fff' } } },
      })
      expect(badName.status).toBe(400)
      expect(
        (await t.request('/api/v1/users/me/preferences', { actor: asAnonymous() })).status,
      ).toBe(401)
    })

    it('removes preferences with the user', async () => {
      const { users } = await setup()
      const user = await users((s) => s.create({ email: 'gone@example.com', displayName: 'Gone' }))
      await users((s) => s.updatePreferences(user.id, { colorScheme: 'dark' }))
      await db.db.execute(sql`delete from users.users where id = ${user.id}`)
      await expect(
        users((s) => s.updatePreferences(user.id, { colorScheme: 'dark' })),
      ).rejects.toBeInstanceOf(NotFoundError)
      const { rows } = await db.db.execute(sql`select count(*)::int as n from users.preferences`)
      const [row] = rows as { n: number }[]
      expect(row?.n).toBe(0)
    })
  })
})
