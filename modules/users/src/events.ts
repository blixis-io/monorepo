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
