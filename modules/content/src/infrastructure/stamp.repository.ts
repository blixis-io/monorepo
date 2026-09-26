import type { Database, Transaction } from '@blixis/database'
import { sql } from 'drizzle-orm'

type Queryable = Database | Transaction

/** Per-space delivery content stamps (ADR 0012). */
export const stampRepository = {
  /** The stamp of a space; `0` until the first bump. */
  async get(db: Queryable, spaceId: string): Promise<number> {
    const result = await db.execute<{ stamp: string }>(
      sql`select stamp from content.delivery_stamps where space_id = ${spaceId}::uuid`,
    )
    return Number(result.rows[0]?.stamp ?? 0)
  },
  /** Moves the stamp forward (creating it on first use); returns the new stamp. */
  async bump(db: Queryable, organizationId: string, spaceId: string): Promise<number> {
    const result = await db.execute<{ stamp: string }>(sql`
      insert into content.delivery_stamps (space_id, organization_id, stamp) values (${spaceId}::uuid, ${organizationId}::uuid, 1)
      on conflict (space_id) do update set stamp = content.delivery_stamps.stamp + 1, updated_at = now()
      returning stamp`)
    return Number(result.rows[0]?.stamp ?? 0)
  },
  async deleteForSpace(db: Queryable, spaceId: string): Promise<void> {
    await db.execute(sql`delete from content.delivery_stamps where space_id = ${spaceId}::uuid`)
  },
}
