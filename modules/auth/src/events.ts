import { defineEvent } from '@blixis/contracts'
import { z } from 'zod'

/** A user signed in (new refresh-token family). Best-effort: audit and analytics only. */
export const userSignedIn = defineEvent({
  type: 'user.signed-in',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ userId: z.string(), familyId: z.string() }),
  description: 'A user signed in with a password.',
})

/** A user signed out (family revoked). Best-effort. */
export const userSignedOut = defineEvent({
  type: 'user.signed-out',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ userId: z.string(), familyId: z.string() }),
  description: 'A user signed out; the refresh-token family was revoked.',
})
