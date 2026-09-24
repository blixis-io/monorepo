import {
  defineEvent,
  defineMigration,
  EVENT_BUS,
  type ModuleHonoEnv,
  subscribe,
} from '@blixis/contracts'
import {
  DATABASE,
  fromTransactionScope,
  newId,
  toTransactionScope,
  withTransaction,
} from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

z.config({ jitless: true })

/** Transactional event of the fixture module. */
export const noteCreated = defineEvent({
  type: 'note.created',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ noteId: z.string(), emittedAt: z.number() }),
})

/** Test controls for the subscription. */
export const fixtureControls = { failuresLeft: 0, handledAt: new Map<string, number>() }

/**
 * Fixture module for the event pipeline test (roadmap 006.007): a table, a command route that
 * writes a note and emits `note.created` in one transaction, and a subscription that writes a
 * side-effect row with transactional idempotency. Test-only — never in `blixis.config.ts`.
 */
export const notesFixture = defineModule({
  meta: { name: '@fixture/notes', version: '1.0.0' },
  migrations: [
    defineMigration({
      id: '0001_create_notes',
      up: `create schema fixture_notes;
           create table fixture_notes.notes (id uuid primary key, body text not null);
           create table fixture_notes.stats (note_id uuid primary key, counted_at timestamptz not null default now());`,
    }),
  ],
  rest: {
    path: '/notes',
    app: new Hono<ModuleHonoEnv>().post('/', async (c) => {
      const { body, fail } = (await c.req.json()) as { body: string; fail?: boolean }
      const id = newId()
      await withTransaction(c.var.services.get(DATABASE), async (tx) => {
        await tx.execute(sql`insert into fixture_notes.notes values (${id}::uuid, ${body})`)
        await c.var.services
          .get(EVENT_BUS)
          .emit(
            noteCreated,
            { noteId: id, emittedAt: Date.now() },
            { transaction: toTransactionScope(tx) },
          )
        if (fail === true) throw new Error('command failed after emit')
      })
      return c.json({ id }, 201)
    }),
  },
  events: [
    subscribe(
      noteCreated,
      'count-note',
      async (envelope, context) => {
        if (fixtureControls.failuresLeft > 0) {
          fixtureControls.failuresLeft--
          throw new Error('stats temporarily unavailable')
        }
        const tx = fromTransactionScope(context.transaction ?? ({} as never))
        await tx.execute(
          sql`insert into fixture_notes.stats (note_id) values (${envelope.payload.noteId}::uuid)`,
        )
        fixtureControls.handledAt.set(envelope.payload.noteId, Date.now())
      },
      { idempotency: 'transactional' },
    ),
  ],
})
