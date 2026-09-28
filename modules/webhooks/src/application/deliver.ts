import type { EventBus, Logger } from '@blixis-io/contracts'
import { type Database, newId } from '@blixis-io/database'
import type { WebhooksConfig } from '../config.ts'
import { DISABLE_AFTER_FAILURES, MAX_ATTEMPTS, nextAttemptAt, outcomeOf } from '../domain/retry.ts'
import { signWebhook } from '../domain/signature.ts'
import { checkWebhookUrl } from '../domain/url.ts'
import { webhookDisabled } from '../events.ts'
import { deliveryRepository } from '../infrastructure/delivery.repository.ts'
import { decryptSecret, secretKeys } from './crypto.ts'

/** `fetch`, replaceable in tests (`WEBHOOK_FETCH`). */
export type Fetch = (input: Request) => Promise<Response>

export interface DeliverDeps {
  readonly db: Database
  readonly events: EventBus
  readonly config: WebhooksConfig
  readonly fetch: Fetch
  readonly logger: Logger
  readonly now?: () => number
  /** Per-attempt timeout (ms). Default 10 000. */
  readonly timeoutMs?: number
}

/** `User-Agent` of deliveries. */
export const USER_AGENT = 'Blixis-Webhooks/1.0'
/** Longest response excerpt kept in the attempt log. */
export const RESPONSE_EXCERPT_BYTES = 1024
/** How long a claimed delivery is reserved for its attempt. */
const LEASE_SECONDS = 300

/** Reads at most `limit` bytes of a body as text, then cancels the rest. */
async function excerpt(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => undefined)
  const bytes = new Uint8Array(Math.min(size, limit))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset)
    bytes.set(part, offset)
    offset += part.length
    if (offset >= bytes.length) break
  }
  return new TextDecoder().decode(bytes)
}

/**
 * One attempt of one delivery (plan 015.003): claims it (so it's never sent twice at once),
 * signs and POSTs the body, logs the attempt, and schedules a retry, finishes, or gives up.
 * Returns the outcome, or `'skipped'` when the delivery wasn't due or pending.
 */
export async function attemptDelivery(
  deps: DeliverDeps,
  deliveryId: string,
): Promise<'succeeded' | 'retry' | 'failed' | 'abandoned' | 'skipped'> {
  const now = deps.now ?? Date.now
  const claimed = await deliveryRepository.claim(deps.db, deliveryId, LEASE_SECONDS)
  if (claimed === undefined) return 'skipped'
  const { delivery, webhook } = claimed
  const tenant = { organizationId: delivery.organizationId, spaceId: delivery.spaceId }
  const started = now()

  const record = async (
    status: 'succeeded' | 'retry' | 'failed' | 'abandoned',
    result: { statusCode?: number; error?: string; excerpt?: string },
    /** Whether the receiver was reached (or tried): only those count toward disabling. */
    endpoint = true,
  ) => {
    await deliveryRepository.insertAttempt(deps.db, {
      id: newId(),
      ...tenant,
      deliveryId: delivery.id,
      number: delivery.attempts,
      startedAt: new Date(started),
      durationMs: Math.max(0, Math.round(now() - started)),
      statusCode: result.statusCode ?? null,
      error: result.error ?? null,
      responseExcerpt: result.excerpt ?? null,
    })
    const retryAt = status === 'retry' ? nextAttemptAt(delivery.attempts, now()) : undefined
    const final = status === 'retry' && retryAt === undefined ? 'failed' : status
    await deliveryRepository.finish(deps.db, delivery.id, {
      status: final === 'retry' ? 'pending' : final,
      nextAttemptAt: retryAt ?? null,
      statusCode: result.statusCode ?? null,
      error: result.error ?? null,
    })
    if (final === 'succeeded') await deliveryRepository.resetFailures(deps.db, webhook.id)
    else if (endpoint) {
      const failures = await deliveryRepository.countFailure(deps.db, webhook.id)
      if (failures >= DISABLE_AFTER_FAILURES) {
        const reason = `Disabled after ${failures} consecutive failed deliveries (last: ${
          result.statusCode === undefined ? result.error : `HTTP ${result.statusCode}`
        })`
        if (await deliveryRepository.disable(deps.db, webhook.id, reason)) {
          deps.logger.warn('webhooks.disabled', { webhookId: webhook.id, failures })
          await deps.events.emit(webhookDisabled, { webhookId: webhook.id, ...tenant, reason })
        }
      }
    }
    return final
  }

  // A webhook turned off (by an admin or after failures) gets nothing more.
  if (!webhook.active) return record('abandoned', { error: 'The webhook is inactive' }, false)
  const checked = checkWebhookUrl(webhook.url, { allowPrivate: deps.config.allowPrivateUrls })
  if (!checked.ok) return record('abandoned', { error: `URL refused: ${checked.reason}` }, false)

  const body = JSON.stringify(delivery.payload)
  let secret: string
  try {
    secret = await decryptSecret(
      await secretKeys(deps.config.secretKeys),
      webhook.secretEncrypted,
      webhook.id,
    )
  } catch (error) {
    // Configuration problem on our side: keep the delivery and try again later.
    deps.logger.error('webhooks.secret_unavailable', {
      webhookId: webhook.id,
      error: String(error),
    })
    return record('retry', { error: 'Signing secret unavailable (server configuration)' }, false)
  }
  const request = new Request(checked.url, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    headers: {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      'blixis-delivery-id': delivery.id,
      'blixis-event-id': delivery.eventId,
      'blixis-event-type': delivery.eventType,
      'blixis-signature': await signWebhook(secret, body, Math.floor(now() / 1000)),
    },
    body,
  })
  let response: Response
  try {
    response = await deps.fetch(request)
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return record('retry', {
      error: timedOut
        ? `Timed out after ${deps.timeoutMs ?? 10_000} ms`
        : `Request failed: ${String(error).slice(0, 200)}`,
    })
  }
  const text = await excerpt(response, RESPONSE_EXCERPT_BYTES).catch(() => '')
  const outcome = outcomeOf(response.status)
  return record(
    outcome === 'succeeded' ? 'succeeded' : outcome === 'retry' ? 'retry' : 'abandoned',
    {
      statusCode: response.status,
      ...(outcome === 'succeeded' ? {} : { error: `HTTP ${response.status}` }),
      excerpt: text,
    },
  )
}

/** Attempts every due delivery (the retry sweep, on a cron), a few at a time. */
export async function sweepDueDeliveries(deps: DeliverDeps, limit = 25, concurrency = 5) {
  const ids = await deliveryRepository.due(deps.db, limit)
  const results: string[] = []
  for (let i = 0; i < ids.length; i += concurrency)
    results.push(
      ...(await Promise.all(
        ids.slice(i, i + concurrency).map((id) => attemptDelivery(deps, id).catch(() => 'error')),
      )),
    )
  return results
}

export { MAX_ATTEMPTS }
