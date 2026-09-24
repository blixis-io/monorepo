import {
  type Actor,
  type EmitOptions,
  type EventDefinition,
  type EventEnvelope,
  type EventMetadata,
  type RequestContext,
  ValidationError,
  validate,
} from '@blixis/contracts'
import { isId, newId } from '@blixis/shared'
import { assertJsonValue } from './json.ts'
import type { EventRegistry } from './registry.ts'

/** Stable actor reference for event metadata (`user:<id>`, `system:<component>`, …). */
export function actorIdOf(actor: Actor): string | undefined {
  switch (actor.type) {
    case 'user':
      return `user:${actor.userId}`
    case 'apiToken':
      return `apiToken:${actor.tokenId}`
    case 'deliveryKey':
      return `deliveryKey:${actor.keyId}`
    case 'system':
      return `system:${actor.component}`
    case 'anonymous':
      return undefined
  }
}

/** What {@link createEnvelope} needs from the emitting request. */
export type EnvelopeContext = Pick<RequestContext, 'tenant' | 'correlationId' | 'actor' | 'now'>

/**
 * Validates `payload` against the definition's schema, checks it is JSON-serialisable, and wraps
 * it in an {@link EventEnvelope}: UUIDv7 `id`, ISO `timestamp`, tenant ids from the context
 * (overridable via `options`), and tracing metadata (§15, §35).
 *
 * @throws ValidationError when the payload is invalid or not JSON-serialisable.
 */
export async function createEnvelope<TType extends string, TPayload>(
  definition: EventDefinition<TType, TPayload>,
  payload: TPayload,
  context: EnvelopeContext,
  options: EmitOptions & { readonly source?: string } = {},
): Promise<EventEnvelope<TType, TPayload>> {
  const valid = await validate(definition.schema, payload, {
    message: `Invalid payload for event ${definition.type}@${definition.version}`,
  })
  assertJsonValue(valid, ['payload'])
  const tenantId = options.tenantId ?? context.tenant.organizationId
  const spaceId = options.spaceId ?? context.tenant.spaceId
  const actorId = actorIdOf(context.actor)
  return {
    id: newId(),
    type: definition.type,
    version: definition.version,
    timestamp: context.now().toISOString(),
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(spaceId === undefined ? {} : { spaceId }),
    payload: valid,
    metadata: {
      correlationId: context.correlationId,
      ...(actorId === undefined ? {} : { actorId }),
      ...(options.source === undefined ? {} : { source: options.source }),
    },
  }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/**
 * Parses an envelope received from a queue or the outbox (§29: queue messages are untrusted):
 * checks the envelope shape, looks up the definition by type and version, and validates the
 * payload against its schema.
 *
 * @throws ValidationError for malformed envelopes, unknown type/version, or invalid payloads.
 */
export async function parseEnvelope(raw: unknown, registry: EventRegistry): Promise<EventEnvelope> {
  const issues: { path: string[]; message: string }[] = []
  const envelope = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  if (!isId(envelope['id'])) issues.push({ path: ['id'], message: 'must be a UUID' })
  if (typeof envelope['type'] !== 'string')
    issues.push({ path: ['type'], message: 'must be a string' })
  if (!Number.isInteger(envelope['version']))
    issues.push({ path: ['version'], message: 'must be an integer' })
  if (typeof envelope['timestamp'] !== 'string' || !ISO_TIMESTAMP.test(envelope['timestamp'])) {
    issues.push({ path: ['timestamp'], message: 'must be an ISO-8601 UTC timestamp' })
  }
  for (const field of ['tenantId', 'spaceId'] as const) {
    if (envelope[field] !== undefined && typeof envelope[field] !== 'string') {
      issues.push({ path: [field], message: 'must be a string' })
    }
  }
  const metadata = envelope['metadata']
  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
  ) {
    issues.push({ path: ['metadata'], message: 'must be an object' })
  }
  if (issues.length > 0) throw new ValidationError('Malformed event envelope', issues)

  const type = envelope['type'] as string
  const version = envelope['version'] as number
  const definition = registry.get(type, version)
  if (definition === undefined) {
    throw new ValidationError('Unknown event', [
      { path: ['type'], message: `no definition for ${type}@${version}` },
    ])
  }
  const payload = await validate(definition.schema, envelope['payload'], {
    message: `Invalid payload for event ${type}@${version}`,
  })
  const tenantId = envelope['tenantId'] as string | undefined
  const spaceId = envelope['spaceId'] as string | undefined
  return {
    id: envelope['id'] as string,
    type,
    version,
    timestamp: envelope['timestamp'] as string,
    ...(tenantId === undefined ? {} : { tenantId }),
    ...(spaceId === undefined ? {} : { spaceId }),
    payload,
    ...(metadata === undefined
      ? {}
      : { metadata: pickMetadata(metadata as Record<string, unknown>) }),
  }
}

/** Keeps only known string metadata fields of an untrusted envelope. */
function pickMetadata(raw: Record<string, unknown>): EventMetadata {
  const out: Record<string, string> = {}
  for (const field of ['correlationId', 'actorId', 'source'] as const) {
    if (typeof raw[field] === 'string') out[field] = raw[field]
  }
  return out
}
