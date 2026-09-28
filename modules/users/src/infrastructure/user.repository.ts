import { type Database, type Transaction, translateDatabaseError } from '@blixis/database'
import { eq, sql } from 'drizzle-orm'
import type { User, UserStatus } from '../domain/user.ts'
import { preferences, users } from './schema.ts'

type Queryable = Database | Transaction
type Row = typeof users.$inferSelect

const toUser = (row: Row): User => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** Data access for `users.users`. Accepts a database or a transaction. */
export const userRepository = {
  async findById(db: Queryable, id: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id))
    return row === undefined ? undefined : toUser(row)
  },

  async findByEmail(db: Queryable, email: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.email, email))
    return row === undefined ? undefined : toUser(row)
  },

  async insert(db: Queryable, values: { email: string; displayName: string }): Promise<User> {
    try {
      const [row] = await db.insert(users).values(values).returning()
      if (row === undefined) throw new Error('insert returned no row')
      return toUser(row)
    } catch (error) {
      throw translateDatabaseError(error)
    }
  },

  async update(
    db: Queryable,
    id: string,
    values: { displayName?: string; status?: UserStatus },
  ): Promise<User | undefined> {
    const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning()
    return row === undefined ? undefined : toUser(row)
  },
}

/** Data access for `users.preferences` (one JSON document per user). */
export const preferencesRepository = {
  async find(db: Queryable, userId: string): Promise<unknown> {
    const [row] = await db.select().from(preferences).where(eq(preferences.userId, userId))
    return row?.data
  },

  async upsert(db: Queryable, userId: string, data: unknown): Promise<void> {
    await db
      .insert(preferences)
      .values({ userId, data })
      .onConflictDoUpdate({ target: preferences.userId, set: { data, updatedAt: sql`now()` } })
  },
}
