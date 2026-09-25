import { ConflictError, NotFoundError, ValidationError } from '@blixis/contracts'
import { DATABASE, databaseModule, toTransactionScope, withTransaction } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { asAnonymous, asApiToken, asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
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
})
