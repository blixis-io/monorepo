import {
  type Actor,
  type AuthorizationService,
  actorId,
  ConflictError,
  createServiceToken,
  NotFoundError,
  type PermissionId,
  type ServiceToken,
  ValidationError,
  type ValidationIssue,
} from '@blixis/contracts'
import { type Database, isId, newId } from '@blixis/database'
import type { EnvironmentService } from '@blixis/spaces'
import type { WebhooksConfig } from '../config.ts'
import { checkWebhookUrl } from '../domain/url.ts'
import { isValidEventPattern, PUBLIC_WEBHOOK_EVENTS, type Webhook } from '../domain/webhook.ts'
import { type SpaceTenant, webhookRepository } from '../infrastructure/webhook.repository.ts'
import { WEBHOOK_PERMISSIONS } from '../permissions.ts'
import { encryptSecret, generateWebhookSecret, secretKeys } from './crypto.ts'

/** A webhook as the API returns it — never with its secret. */
export interface WebhookView {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly eventTypes: readonly string[]
  /** Only events of this environment; `null` for all. */
  readonly environmentId: string | null
  readonly active: boolean
  /** Recognise the secret without revealing it, e.g. `whsec_…a1b2`. */
  readonly secretHint: string
  readonly failureCount: number
  /** Why Blixis disabled the webhook (e.g. repeated failures); `null` otherwise. */
  readonly disabledReason: string | null
  /** Send it back as `expectedVersion` / `If-Match`. */
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string
  readonly updatedBy: string
}

/** Input for creating a webhook. */
export interface WebhookInput {
  readonly name: string
  readonly url: string
  /** Public event types, `group.*`, or `*`. */
  readonly eventTypes: readonly string[]
  readonly environmentId?: string | null | undefined
  readonly active?: boolean | undefined
}

/**
 * Webhooks of a space on behalf of an actor (plan 015). Request-scoped:
 * `services.get(WEBHOOK_SERVICE)`.
 */
export interface WebhookService {
  /**
   * The tenant of a webhook, for webhook-id routes: verifies the actor may read it first (§31).
   * @throws NotFoundError for unknown webhooks and webhooks the actor cannot access
   */
  resolveTenant(actor: Actor, webhookId: string): Promise<SpaceTenant>
  list(actor: Actor, tenant: SpaceTenant): Promise<WebhookView[]>
  /** @throws NotFoundError */
  get(actor: Actor, tenant: SpaceTenant, id: string): Promise<WebhookView>
  /**
   * Creates a webhook; the signing `secret` is returned **once**.
   * @throws ValidationError (URL policy, unknown event types, foreign environment)
   */
  create(
    actor: Actor,
    tenant: SpaceTenant,
    input: WebhookInput,
  ): Promise<{ webhook: WebhookView; secret: string }>
  /**
   * Changes a webhook; omitted properties stay. Reactivating (`active: true`) clears the failure
   * count and the disabled reason. @throws ConflictError (stale version), ValidationError
   */
  update(
    actor: Actor,
    tenant: SpaceTenant,
    id: string,
    input: Partial<WebhookInput> & { expectedVersion: number },
  ): Promise<WebhookView>
  /** Replaces the signing secret; the new one is returned **once**. */
  rotateSecret(
    actor: Actor,
    tenant: SpaceTenant,
    id: string,
  ): Promise<{ webhook: WebhookView; secret: string }>
  /** Deletes the webhook with its delivery log. @throws NotFoundError */
  delete(actor: Actor, tenant: SpaceTenant, id: string): Promise<void>
}

export const WEBHOOK_SERVICE: ServiceToken<WebhookService> = createServiceToken<WebhookService>(
  '@blixis/webhooks.webhooks',
)

export interface WebhookServiceDeps {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly environments: Pick<EnvironmentService, 'list'>
  /** Resolved on first use: listing works without the secret keys. */
  readonly config: () => WebhooksConfig
}

const P = WEBHOOK_PERMISSIONS
const hint = (secret: string) => `whsec_…${secret.slice(-4)}`

export const toWebhookView = (webhook: Webhook): WebhookView => ({
  id: webhook.id,
  name: webhook.name,
  url: webhook.url,
  eventTypes: webhook.eventTypes,
  environmentId: webhook.environmentId,
  active: webhook.active,
  secretHint: webhook.secretHint,
  failureCount: webhook.failureCount,
  disabledReason: webhook.disabledReason,
  version: webhook.version,
  createdAt: webhook.createdAt,
  updatedAt: webhook.updatedAt,
  createdBy: webhook.createdBy,
  updatedBy: webhook.updatedBy,
})

export function createWebhookService(deps: WebhookServiceDeps): WebhookService {
  const { db, authz } = deps

  const require = (actor: Actor, action: PermissionId, tenant: SpaceTenant, id?: string) =>
    authz.require({
      actor,
      action,
      resource: { type: 'webhook', ...(id === undefined ? {} : { id }), ...tenant },
    })

  async function load(tenant: SpaceTenant, id: string): Promise<Webhook> {
    const webhook = isId(id) ? await webhookRepository.findById(db, tenant, id) : undefined
    if (webhook === undefined) throw new NotFoundError('Webhook not found')
    return webhook
  }

  async function sealed(id: string, secret: string) {
    const keys = await secretKeys(deps.config().secretKeys)
    return { secretEncrypted: await encryptSecret(keys, secret, id), secretHint: hint(secret) }
  }

  /** Validates changed properties; returns their normalized values. */
  async function check(actor: Actor, tenant: SpaceTenant, input: Partial<WebhookInput>) {
    const issues: ValidationIssue[] = []
    const values: {
      name?: string
      url?: string
      eventTypes?: string[]
      environmentId?: string | null
    } = {}
    if (input.name !== undefined) {
      const name = String(input.name).trim()
      if (name === '' || name.length > 100)
        issues.push({ path: ['name'], message: 'Use 1–100 characters' })
      values.name = name
    }
    if (input.url !== undefined) {
      const checked = checkWebhookUrl(String(input.url), {
        allowPrivate: deps.config().allowPrivateUrls,
      })
      if (checked.ok) values.url = checked.url
      else issues.push({ path: ['url'], message: checked.reason })
    }
    if (input.eventTypes !== undefined) {
      const types = Array.isArray(input.eventTypes)
        ? [...new Set(input.eventTypes.map(String))]
        : []
      if (types.length === 0 || types.length > 50)
        issues.push({ path: ['eventTypes'], message: 'Choose 1–50 event types' })
      types.forEach((type, i) => {
        if (!isValidEventPattern(type))
          issues.push({
            path: ['eventTypes', i],
            message: `Unknown event type "${type}". Use one of ${PUBLIC_WEBHOOK_EVENTS.join(', ')}, a group such as entry.*, or *`,
          })
      })
      values.eventTypes = types
    }
    if (input.environmentId !== undefined) {
      if (input.environmentId === null) values.environmentId = null
      else {
        const known = (await deps.environments.list(actor, tenant)).map((e) => e.id)
        if (!known.includes(String(input.environmentId)))
          issues.push({ path: ['environmentId'], message: 'Not an environment of this space' })
        values.environmentId = String(input.environmentId)
      }
    }
    if (issues.length > 0) throw new ValidationError('Invalid webhook', issues)
    return values
  }

  const stale = (current: number) =>
    new ConflictError(
      `The webhook changed since you loaded it (now version ${current}): reload and retry`,
    )

  return {
    async resolveTenant(actor, webhookId) {
      const found = isId(webhookId)
        ? await webhookRepository.findForResolution(db, webhookId)
        : undefined
      if (found === undefined) throw new NotFoundError('Webhook not found')
      await require(actor, P.read.id, found, webhookId)
      return found
    },

    async list(actor, tenant) {
      await require(actor, P.read.id, tenant)
      return (await webhookRepository.list(db, tenant)).map(toWebhookView)
    },

    async get(actor, tenant, id) {
      await require(actor, P.read.id, tenant, id)
      return toWebhookView(await load(tenant, id))
    },

    async create(actor, tenant, input) {
      await require(actor, P.manage.id, tenant)
      const missing: ValidationIssue[] = []
      for (const key of ['name', 'url', 'eventTypes'] as const)
        if (input[key] === undefined) missing.push({ path: [key], message: 'Required' })
      if (missing.length > 0) throw new ValidationError('Invalid webhook', missing)
      const values = await check(actor, tenant, input)
      const id = newId()
      const secret = generateWebhookSecret()
      const webhook = await webhookRepository.insert(db, tenant, {
        id,
        name: values.name ?? '',
        url: values.url ?? '',
        eventTypes: values.eventTypes ?? [],
        environmentId: values.environmentId ?? null,
        active: input.active !== false,
        ...(await sealed(id, secret)),
        actor: actorId(actor),
      })
      return { webhook: toWebhookView(webhook), secret }
    },

    async update(actor, tenant, id, input) {
      await require(actor, P.manage.id, tenant, id)
      const current = await load(tenant, id)
      if (current.version !== input.expectedVersion) throw stale(current.version)
      const values = await check(actor, tenant, input)
      const reactivate = input.active === true && !current.active
      const updated = await webhookRepository.update(db, tenant, id, input.expectedVersion, {
        ...values,
        ...(input.active === undefined ? {} : { active: input.active === true }),
        ...(reactivate ? { failureCount: 0, disabledReason: null } : {}),
        actor: actorId(actor),
      })
      if (updated === undefined) throw stale(current.version + 1)
      return toWebhookView(updated)
    },

    async rotateSecret(actor, tenant, id) {
      await require(actor, P.manage.id, tenant, id)
      const current = await load(tenant, id)
      const secret = generateWebhookSecret()
      const updated = await webhookRepository.update(db, tenant, id, current.version, {
        ...(await sealed(id, secret)),
        actor: actorId(actor),
      })
      if (updated === undefined) throw stale(current.version + 1)
      return { webhook: toWebhookView(updated), secret }
    },

    async delete(actor, tenant, id) {
      await require(actor, P.manage.id, tenant, id)
      if (!(isId(id) && (await webhookRepository.delete(db, tenant, id))))
        throw new NotFoundError('Webhook not found')
    },
  }
}
