import { defineEvent } from './events.ts'
import { struct } from './struct.ts'

/**
 * A space was deleted (emitted by `@blixis/spaces` in the deleting transaction). Every module that
 * stores data per space subscribes and deletes it — first-party or not, so the definition is
 * public (ADR 0016).
 */
export const spaceDeleted = defineEvent({
  type: 'space.deleted',
  version: 1,
  delivery: 'transactional',
  schema: struct({ spaceId: 'string', organizationId: 'string' }),
  description: 'A space was deleted; modules must delete their data for it.',
})
