import type { Actor, EventEnvelope } from '@blixis/contracts'
import type { Database } from '@blixis/database'
import { stampRepository } from '../infrastructure/stamp.repository.ts'

/**
 * Remembers each space's content stamp for a short time per isolate (ADR 0012 §1): a cache hit
 * then needs no query, and a publish is visible after at most `ttlMs` plus event delivery.
 */
export function createStampMemo(options: { ttlMs: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const memo = new Map<string, { stamp: number; at: number }>()
  return {
    async get(db: Database, spaceId: string): Promise<number> {
      const known = memo.get(spaceId)
      if (known !== undefined && now() - known.at < options.ttlMs) return known.stamp
      const stamp = await stampRepository.get(db, spaceId)
      memo.set(spaceId, { stamp, at: now() })
      return stamp
    },
    /** Called after a bump in this isolate, so it sees the new stamp at once. */
    set(spaceId: string, stamp: number) {
      memo.set(spaceId, { stamp, at: now() })
    },
  }
}
export type StampMemo = ReturnType<typeof createStampMemo>

/**
 * The delivery cache policy of `@blixis/content` (ADR 0012 §3): only delivery keys (not preview
 * keys) that may read every environment are cached; the scope is `space:environment:stamp`.
 */
export async function deliveryCacheScope(
  actor: Actor,
  requested: { spaceId?: string; environment?: string },
  stamp: (spaceId: string) => Promise<number>,
): Promise<string | undefined> {
  if (actor.type !== 'deliveryKey' || actor.kind !== 'delivery' || actor.environmentIds !== null)
    return undefined
  if (requested.spaceId !== undefined && requested.spaceId !== actor.spaceId) return undefined
  return `${actor.spaceId}:${requested.environment ?? ''}:${await stamp(actor.spaceId)}`
}

/** Bumps the stamp of the space an event belongs to (idempotent enough: stamps only move forward). */
export async function bumpForEvent(
  db: Database,
  memo: StampMemo,
  envelope: EventEnvelope,
): Promise<void> {
  const payload = (envelope.payload ?? {}) as { organizationId?: string; spaceId?: string }
  const spaceId = envelope.spaceId ?? payload.spaceId
  const organizationId = envelope.tenantId ?? payload.organizationId
  if (spaceId === undefined || organizationId === undefined) return
  memo.set(spaceId, await stampRepository.bump(db, organizationId, spaceId))
}
