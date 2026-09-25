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
