import { defineEvent } from '@blixis/contracts'
import { z } from 'zod'

/** An organization was created. Best-effort: no consumer derives state from it yet. */
export const organizationCreated = defineEvent({
  type: 'organization.created',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({
    organizationId: z.string(),
    slug: z.string(),
    createdBy: z.string().optional(),
  }),
  description: 'An organization was created.',
})

/**
 * A space was created, with its default environment and locale. Transactional: downstream
 * provisioning (content defaults, delivery keys, search indexes) relies on it.
 */
export const spaceCreated = defineEvent({
  type: 'space.created',
  version: 1,
  delivery: 'transactional',
  schema: z.object({
    spaceId: z.string(),
    organizationId: z.string(),
    slug: z.string(),
    defaultEnvironmentId: z.string(),
    defaultLocale: z.string(),
  }),
  description: 'A space was created with its default environment and locale.',
})

/** A space's name changed. Best-effort. */
export const spaceUpdated = defineEvent({
  type: 'space.updated',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ spaceId: z.string(), organizationId: z.string() }),
  description: 'A space was renamed.',
})

/**
 * A space was deleted, with its environments, locales, and space memberships. Transactional:
 * every module storing space data subscribes and deletes its own rows (no cross-module FKs).
 */
export const spaceDeleted = defineEvent({
  type: 'space.deleted',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ spaceId: z.string(), organizationId: z.string() }),
  description: 'A space was deleted; modules must delete their data for it.',
})

const localeEventSchema = z.object({
  spaceId: z.string(),
  organizationId: z.string(),
  localeId: z.string(),
  code: z.string(),
})

/** A locale was added to a space. Best-effort: content may subscribe later. */
export const localeCreated = defineEvent({
  type: 'locale.created',
  version: 1,
  delivery: 'best-effort',
  schema: localeEventSchema,
  description: 'A locale was added to a space.',
})

/** A locale's name, fallback, or default flag changed. Best-effort. */
export const localeUpdated = defineEvent({
  type: 'locale.updated',
  version: 1,
  delivery: 'best-effort',
  schema: localeEventSchema,
  description: 'A locale changed.',
})

/** A locale was removed from a space. Best-effort. */
export const localeDeleted = defineEvent({
  type: 'locale.deleted',
  version: 1,
  delivery: 'best-effort',
  schema: localeEventSchema,
  description: 'A locale was removed from a space.',
})
