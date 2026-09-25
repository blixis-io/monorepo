import type { Database, Transaction } from '@blixis/database'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { credentials, refreshTokens } from './schema.ts'

type Queryable = Database | Transaction
export type RefreshTokenRow = typeof refreshTokens.$inferSelect

export const credentialRepository = {
  async passwordHash(db: Queryable, userId: string): Promise<string | undefined> {
    const [row] = await db
      .select({ hash: credentials.passwordHash })
      .from(credentials)
      .where(eq(credentials.userId, userId))
    return row?.hash
  },
  async upsert(db: Queryable, userId: string, passwordHash: string): Promise<void> {
    await db
      .insert(credentials)
      .values({ userId, passwordHash })
      .onConflictDoUpdate({
        target: credentials.userId,
        set: { passwordHash, updatedAt: new Date() },
      })
  },
}

export const refreshTokenRepository = {
  async insert(db: Queryable, row: typeof refreshTokens.$inferInsert): Promise<void> {
    await db.insert(refreshTokens).values(row)
  },
  async findByHash(db: Queryable, tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const [row] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
    return row
  },
  /** Marks a token rotated if it was not yet; `false` when another request rotated it first. */
  async markRotated(db: Queryable, id: string): Promise<boolean> {
    const rows = await db
      .update(refreshTokens)
      .set({ rotatedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.rotatedAt)))
      .returning({ id: refreshTokens.id })
    return rows.length > 0
  },
  async revokeFamily(db: Queryable, familyId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
  },
  /** Whether a family still has a usable (not revoked, not expired) token. */
  async familyActive(db: Queryable, familyId: string): Promise<boolean> {
    const rows = await db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
          sql`${refreshTokens.familyExpiresAt} > now()`,
        ),
      )
      .limit(1)
    return rows.length > 0
  },
  async revokeAllForUser(db: Queryable, userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  },
  /** Deletes families that ended more than `graceDays` ago (expired or long revoked). */
  async deleteExpired(db: Queryable, graceDays: number): Promise<void> {
    await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.familyExpiresAt, sql`now() - make_interval(days => ${graceDays})`))
  },
}
