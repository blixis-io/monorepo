import {
  type Actor,
  type AuthorizationService,
  createServiceToken,
  NotFoundError,
  type ServiceToken,
  ValidationError,
} from '@blixis/contracts'
import type { Database } from '@blixis/database'
import type { LocaleService, TenantResolver } from '@blixis/spaces'
import type { ContentType } from '../domain/content-type.ts'
import type { Entry, EntryState, EntryVersion } from '../domain/entry.ts'
import {
  contentTypeRepository,
  type EnvironmentTenant,
} from '../infrastructure/content-type.repository.ts'
import { entryRepository } from '../infrastructure/entry.repository.ts'
import { CONTENT_PERMISSIONS } from '../permissions.ts'

/** The space, environment, model, and locales a delivery request reads (ADR 0011 §2). */
export interface DeliveryScope {
  readonly tenant: EnvironmentTenant
  readonly types: readonly ContentType[]
  readonly locales: {
    codes: string[]
    defaultCode: string
    fallbacks: Record<string, string | null>
  }
  /** Identifies the content model version: `space:environment:hash` (schema cache key). */
  readonly modelKey: string
}

/** An entry with the version delivered and its content type. */
export interface DeliveredEntry {
  readonly entry: Entry
  readonly version: EntryVersion
  readonly contentType: ContentType
}

/**
 * Read-only content access for the delivery API (plan 012.006). `scope` verifies the actor may
 * read the space (`content.delivery.read`; delivery and preview keys only their own space and
 * allowed environments); reads then run in that scope. Request-scoped.
 */
export interface DeliveryService {
  /**
   * @throws ValidationError (no space chosen), NotFoundError (unknown or inaccessible space or
   * environment), ForbiddenError (no delivery permission)
   */
  scope(
    actor: Actor,
    request: { spaceId?: string | undefined; environment?: string | undefined },
  ): Promise<DeliveryScope>
  /** Drafts need `content.preview.read`. @throws ForbiddenError */
  requireState(actor: Actor, scope: DeliveryScope, state: EntryState): Promise<void>
  /** Entries by id in one query; missing, unpublished (for `published`) or foreign ids are absent. */
  entries(
    scope: DeliveryScope,
    ids: readonly string[],
    state: EntryState,
  ): Promise<Map<string, DeliveredEntry>>
  collection(
    scope: DeliveryScope,
    contentType: ContentType,
    query: {
      state: EntryState
      filters: Record<string, unknown>
      limit: number
      cursor?: string | undefined
    },
  ): Promise<{ items: DeliveredEntry[]; nextCursor: string | null }>
}

export const DELIVERY_SERVICE: ServiceToken<DeliveryService> = createServiceToken<DeliveryService>(
  '@blixis/content.delivery',
)

/** 32-bit FNV-1a, hex — a short, stable key for the content model version. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const encodeCursor = (updatedAt: string, id: string) =>
  btoa(JSON.stringify([updatedAt, id])).replace(/=+$/, '')
function decodeCursor(value: string): { updatedAt: string; id: string } {
  try {
    const [updatedAt, id] = JSON.parse(atob(value)) as [unknown, unknown]
    if (typeof updatedAt === 'string' && typeof id === 'string') return { updatedAt, id }
  } catch {}
  throw new ValidationError('Invalid cursor', [
    { path: ['cursor'], message: 'Use nextCursor from the previous page' },
  ])
}

export function createDeliveryService(deps: {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly tenants: TenantResolver
  readonly locales: Pick<LocaleService, 'codes'>
}): DeliveryService {
  const { db, authz } = deps
  const scopes = new Map<string, Promise<DeliveryScope>>()
  const system: Actor = { type: 'system', component: '@blixis/content.delivery' }

  async function resolve(
    actor: Actor,
    spaceId: string | undefined,
    environment: string | undefined,
  ) {
    if (actor.type === 'deliveryKey') {
      if (spaceId !== undefined && spaceId !== actor.spaceId)
        throw new NotFoundError('Space not found')
      spaceId = actor.spaceId
    }
    if (spaceId === undefined)
      throw new ValidationError('Choose a space', [
        { path: ['space'], message: 'Pass ?space=<id> or the X-Blixis-Space header' },
      ])
    // Existence first (as the platform), then the actor's permission: both fail as 404 alike.
    const resolved = await deps.tenants.resolveSpace(system, spaceId, environment)
    const tenant = {
      organizationId: resolved.organizationId,
      spaceId: resolved.spaceId,
      environmentId: resolved.environmentId,
    }
    await authz.require({
      actor,
      action: CONTENT_PERMISSIONS.deliveryRead.id,
      resource: {
        type: 'space',
        id: tenant.spaceId,
        organizationId: tenant.organizationId,
        spaceId: tenant.spaceId,
      },
    })
    if (
      actor.type === 'deliveryKey' &&
      actor.environmentIds !== null &&
      !actor.environmentIds.includes(tenant.environmentId)
    )
      throw new NotFoundError('Environment not found')
    const types = await contentTypeRepository.list(db, tenant)
    const signature = types
      .map((t) => `${t.id}:${t.version}`)
      .sort()
      .join(',')
    return {
      tenant,
      types,
      locales: await deps.locales.codes(tenant),
      modelKey: `${tenant.spaceId}:${tenant.environmentId}:${fnv1a(signature)}`,
    }
  }

  const withType = (scope: DeliveryScope, row: { entry: Entry; version: EntryVersion }) => {
    const contentType = scope.types.find((t) => t.id === row.entry.contentTypeId)
    return contentType === undefined ? undefined : { ...row, contentType }
  }

  return {
    scope(actor, request) {
      const key = `${request.spaceId ?? ''}|${request.environment ?? ''}`
      let scope = scopes.get(key)
      if (scope === undefined) {
        scope = resolve(actor, request.spaceId, request.environment)
        scopes.set(key, scope)
      }
      return scope
    },

    async requireState(actor, scope, state) {
      if (state === 'published') return
      await authz.require({
        actor,
        action: CONTENT_PERMISSIONS.previewRead.id,
        resource: {
          type: 'space',
          id: scope.tenant.spaceId,
          organizationId: scope.tenant.organizationId,
          spaceId: scope.tenant.spaceId,
        },
      })
    },

    async entries(scope, ids, state) {
      const rows = await entryRepository.findManyWithVersions(db, scope.tenant, ids, state)
      const found = new Map<string, DeliveredEntry>()
      for (const row of rows) {
        const delivered = withType(scope, row)
        if (delivered !== undefined) found.set(row.entry.id, delivered)
      }
      return found
    },

    async collection(scope, contentType, query) {
      const rows = await entryRepository.list(db, scope.tenant, {
        state: query.state,
        contentTypeId: contentType.id,
        fieldFilters: query.filters,
        cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
        limit: query.limit + 1,
      })
      const items = rows.slice(0, query.limit).flatMap((row) => {
        const delivered = withType(scope, row)
        return delivered === undefined ? [] : [delivered]
      })
      const last = rows.length > query.limit ? items.at(-1)?.entry : undefined
      return {
        items,
        nextCursor: last === undefined ? null : encodeCursor(last.updatedAt, last.id),
      }
    },
  }
}
