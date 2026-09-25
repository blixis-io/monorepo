import {
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

/** A verified tenant: callers pass the tenant from the resolved request context (008.005). */
export interface SpaceTenant {
  readonly organizationId: string
  readonly spaceId: string
}

/** Environments of a space. MVP: only the default `main`; creating/cloning is deferred. */
export interface EnvironmentService {
  list(tenant: SpaceTenant): Promise<Environment[]>
  /** @throws NotFoundError when the space has no default environment */
  getDefault(tenant: SpaceTenant): Promise<Environment>
}

/** Locales of a space: exactly one default, acyclic fallbacks. */
export interface LocaleService {
  list(tenant: SpaceTenant): Promise<Locale[]>
  /** @throws ValidationError, ConflictError (code exists, bad fallback) */
  create(
    tenant: SpaceTenant,
    input: { code: string; name?: string; fallbackCode?: string | null; isDefault?: boolean },
  ): Promise<Locale>
  /** @throws NotFoundError, ValidationError, ConflictError */
  update(
    tenant: SpaceTenant,
    localeId: string,
    input: { name?: string; fallbackCode?: string | null; isDefault?: boolean },
  ): Promise<Locale>
  /** @throws NotFoundError, ConflictError (default locale, or another locale's fallback) */
  delete(tenant: SpaceTenant, localeId: string): Promise<void>
}

export const ENVIRONMENT_SERVICE: ServiceToken<EnvironmentService> =
  createServiceToken<EnvironmentService>('@blixis/spaces.environments')
export const LOCALE_SERVICE: ServiceToken<LocaleService> =
  createServiceToken<LocaleService>('@blixis/spaces.locales')

export function createEnvironmentService(db: Database): EnvironmentService {
  return {
    list: (tenant) => environmentRepository.list(db, tenant),
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
}): LocaleService {
  const { db, events } = deps
  type LocaleEvent = typeof localeCreated | typeof localeUpdated | typeof localeDeleted
  const emit = (event: LocaleEvent, tenant: SpaceTenant, locale: Locale) =>
    events.emit(event as typeof localeCreated, {
      ...tenant,
      localeId: locale.id,
      code: locale.code,
    })

  return {
    list: (tenant) => localeRepository.list(db, tenant),

    async create(tenant, input) {
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

    async update(tenant, localeId, input) {
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

    async delete(tenant, localeId) {
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
