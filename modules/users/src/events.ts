import { defineEvent } from '@blixis/contracts'
import { z } from 'zod'

/**
 * A user was created. Transactional: downstream provisioning (e.g. a personal space) relies on
 * it (docs/contracts/events.md). Contains no credentials.
 */
export const userCreated = defineEvent({
  type: 'user.created',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ userId: z.string(), email: z.string(), displayName: z.string() }),
  description: 'A user account was created.',
})

/** A user's profile or status changed. Best-effort: consumers only refresh derived data. */
export const userUpdated = defineEvent({
  type: 'user.updated',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ userId: z.string(), changed: z.array(z.enum(['displayName', 'status'])) }),
  description: 'A user profile or status changed.',
})

/**
 * A user was disabled. Transactional: `@blixis/auth` revokes the user's refresh tokens and API
 * tokens on it — losing it would leave long-lived credentials working.
 */
export const userDisabled = defineEvent({
  type: 'user.disabled',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ userId: z.string() }),
  description: 'A user was disabled; their credentials must stop working.',
})

/** A user was added to an organization or space. Best-effort (audit, notifications). */
export const membershipCreated = defineEvent({
  type: 'membership.created',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({
    membershipId: z.string(),
    userId: z.string(),
    organizationId: z.string(),
    spaceId: z.string().nullable(),
    role: z.string(),
  }),
  description: 'A user was added to an organization or space.',
})

/** A membership was removed. Best-effort. */
export const membershipRemoved = defineEvent({
  type: 'membership.removed',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({
    membershipId: z.string(),
    userId: z.string(),
    organizationId: z.string(),
    spaceId: z.string().nullable(),
  }),
  description: 'A user was removed from an organization or space.',
})
