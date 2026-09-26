import {
  type Actor,
  type AuthorizationService,
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type ServiceToken,
  ValidationError,
  validate,
} from '@blixis/contracts'
import { type Database, withTransaction } from '@blixis/database'
import { z } from 'zod'
import { type Environment, type Locale, localeCodeSchema, nameSchema } from '../domain/tenancy.ts'
import { localeCreated, localeDeleted, localeUpdated } from '../events.ts'
import { environmentRepository, localeRepository } from '../infrastructure/repositories.ts'
import { SPACES_PERMISSIONS } from '../permissions.ts'
import { spaceResource } from './access.ts'

const read = SPACES_PERMISSIONS.spaceRead.id
const write = SPACES_PERMISSIONS.spaceSettingsWrite.id

/** A verified tenant: callers pass the tenant from the resolved request context (008.005). */
export interface SpaceTenant {
  readonly organizationId: string
  readonly spaceId: string
}

/** Environments of a space. MVP: only the default `main`; creating/cloning is deferred. */
export interface EnvironmentService {
  /** Needs `spaces.read`. */
  list(actor: Actor, tenant: SpaceTenant): Promise<Environment[]>
  /**
   * The default environment, for platform code resolving it internally — no authorization.
   * @throws NotFoundError when the space has no default environment
   */
  getDefault(tenant: SpaceTenant): Promise<Environment>
}

/**
 * Locales of a space: exactly one default, acyclic fallbacks. Reading needs `spaces.read`,
 * changes need `spaces.settings.write`; denials throw `ForbiddenError`/`NotFoundError`.
 */
export interface LocaleService {
  list(actor: Actor, tenant: SpaceTenant): Promise<Locale[]>
  /** @throws ValidationError, ConflictError (code exists, bad fallback) */
  create(
    actor: Actor,
    tenant: SpaceTenant,
    input: { code: string; name?: string; fallbackCode?: string | null; isDefault?: boolean },
  ): Promise<Locale>
  /** @throws NotFoundError, ValidationError, ConflictError */
  update(
    actor: Actor,
    tenant: SpaceTenant,
    localeId: string,
    input: { name?: string; fallbackCode?: string | null; isDefault?: boolean },
  ): Promise<Locale>
  /** @throws NotFoundError, ConflictError (default locale, or another locale's fallback) */
  delete(actor: Actor, tenant: SpaceTenant, localeId: string): Promise<void>
  /**
   * Locale codes and the default, for platform code such as entry validation — no authorization:
   * the caller passes a tenant it already verified.
   */
  codes(
    tenant: SpaceTenant,
  ): Promise<{ codes: string[]; defaultCode: string; fallbacks: Record<string, string | null> }>
}

export const ENVIRONMENT_SERVICE: ServiceToken<EnvironmentService> =
  createServiceToken<EnvironmentService>('@blixis/spaces.environments')
export const LOCALE_SERVICE: ServiceToken<LocaleService> =
  createServiceToken<LocaleService>('@blixis/spaces.locales')

export function createEnvironmentService(deps: {
  readonly db: Database
  readonly authz: AuthorizationService
}): EnvironmentService {
  const { db, authz } = deps
  return {
    async list(actor, tenant) {
      await authz.require({ actor, action: read, resource: spaceResource(tenant) })
      return environmentRepository.list(db, tenant)
    },
    async getDefault(tenant) {
      const found = (await environmentRepository.list(db, tenant)).find((e) => e.isDefault)
      if (found === undefined) throw new NotFoundError('Space has no default environment')
      return found
    },
  }
}

const createInput = z.object({
  code: localeCodeSchema,
  name: nameSchema.optional(),
  fallbackCode: localeCodeSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
})
const updateInput = z.object({
  name: nameSchema.optional(),
  fallbackCode: localeCodeSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
})

/** Fails when following fallbacks from `code` with `fallback` set would loop (or hit a missing locale). */
function assertFallback(
  all: readonly Locale[],
  code: string,
  fallback: string | null | undefined,
): void {
  if (fallback === null || fallback === undefined) return
  if (fallback === code) throw new ConflictError('A locale cannot fall back to itself')
  const byCode = new Map(all.map((l) => [l.code, l]))
  if (!byCode.has(fallback))
    throw new ConflictError(`Fallback locale ${fallback} does not exist in this space`)
  const seen = new Set([code])
  let next: string | null = fallback
  while (next !== null) {
    if (seen.has(next)) throw new ConflictError('Locale fallbacks would form a cycle')
    seen.add(next)
    next = byCode.get(next)?.fallbackCode ?? null
  }
}

export function createLocaleService(deps: {
  readonly db: Database
  readonly events: EventBus
  readonly authz: AuthorizationService
}): LocaleService {
  const { db, events, authz } = deps
  const requireWrite = (actor: Actor, tenant: SpaceTenant) =>
    authz.require({ actor, action: write, resource: spaceResource(tenant) })
  type LocaleEvent = typeof localeCreated | typeof localeUpdated | typeof localeDeleted
  const emit = (event: LocaleEvent, tenant: SpaceTenant, locale: Locale) =>
    events.emit(event as typeof localeCreated, {
      ...tenant,
      localeId: locale.id,
      code: locale.code,
    })

  return {
    async list(actor, tenant) {
      await authz.require({ actor, action: read, resource: spaceResource(tenant) })
      return localeRepository.list(db, tenant)
    },

    async codes(tenant) {
      const all = await localeRepository.list(db, tenant)
      const fallback = all.find((l) => l.isDefault) ?? all[0]
      if (fallback === undefined) throw new NotFoundError('The space has no locales')
      return {
        codes: all.map((l) => l.code),
        defaultCode: fallback.code,
        fallbacks: Object.fromEntries(all.map((l) => [l.code, l.fallbackCode])),
      }
    },

    async create(actor, tenant, input) {
      await requireWrite(actor, tenant)
      const values = await validate(createInput, input, { message: 'Invalid locale' })
      const locale = await withTransaction(db, async (tx) => {
        const all = await localeRepository.list(tx, tenant)
        if (all.some((l) => l.code === values.code))
          throw new ConflictError(`Locale ${values.code} already exists`)
        assertFallback(all, values.code, values.fallbackCode)
        if (values.isDefault === true) await localeRepository.clearDefault(tx, tenant)
        return localeRepository.insert(tx, tenant, {
          code: values.code,
          name: values.name ?? values.code,
          isDefault: values.isDefault ?? false,
          fallbackCode: values.fallbackCode ?? null,
        })
      })
      await emit(localeCreated, tenant, locale)
      return locale
    },

    async update(actor, tenant, localeId, input) {
      await requireWrite(actor, tenant)
      const values = await validate(updateInput, input, { message: 'Invalid locale' })
      const locale = await withTransaction(db, async (tx) => {
        const current = await localeRepository.findById(tx, tenant, localeId)
        if (current === undefined) throw new NotFoundError('Locale not found')
        if (values.isDefault === false && current.isDefault) {
          throw new ValidationError('Make another locale the default instead', [
            { path: ['isDefault'], message: 'A space always has exactly one default locale' },
          ])
        }
        const all = await localeRepository.list(tx, tenant)
        const others = all.map((l) =>
          l.id === localeId ? { ...l, fallbackCode: values.fallbackCode ?? l.fallbackCode } : l,
        )
        if (values.fallbackCode !== undefined)
          assertFallback(others, current.code, values.fallbackCode)
        if (values.isDefault === true && !current.isDefault)
          await localeRepository.clearDefault(tx, tenant)
        const updated = await localeRepository.update(tx, tenant, localeId, values)
        if (updated === undefined) throw new NotFoundError('Locale not found')
        return updated
      })
      await emit(localeUpdated, tenant, locale)
      return locale
    },

    async delete(actor, tenant, localeId) {
      await requireWrite(actor, tenant)
      const removed = await withTransaction(db, async (tx) => {
        const current = await localeRepository.findById(tx, tenant, localeId)
        if (current === undefined) throw new NotFoundError('Locale not found')
        if (current.isDefault)
          throw new ConflictError(
            'The default locale cannot be deleted; make another locale the default first',
          )
        const dependents = (await localeRepository.list(tx, tenant)).filter(
          (l) => l.fallbackCode === current.code,
        )
        if (dependents.length > 0) {
          throw new ConflictError(
            `${dependents.map((l) => l.code).join(', ')} fall back to ${current.code}; change them first`,
          )
        }
        await localeRepository.delete(tx, tenant, localeId)
        return current
      })
      await emit(localeDeleted, tenant, removed)
    },
  }
}
