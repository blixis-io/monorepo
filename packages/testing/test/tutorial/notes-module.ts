// The Notes module built in the manual's tutorials (apps/docs/src/content/docs/tutorials).
// Kept here so every tutorial snippet is compiled and tested. Update both together.

// #region imports
import {
  defineEvent,
  defineMigration,
  EVENT_BUS,
  type ModuleHonoEnv,
  NotFoundError,
  subscribe,
  validate,
} from '@blixis/contracts'
import {
  DATABASE,
  fromTransactionScope,
  idColumn,
  isId,
  tenantScope,
  timestamps,
  toTransactionScope,
  withTransaction,
} from '@blixis/database'
import { idempotent } from '@blixis/database/idempotency'
import { defineModule } from '@blixis/kernel'
import { and, eq, sql } from 'drizzle-orm'
import { integer, pgSchema, text, uuid } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import { z } from 'zod'
// #endregion imports

// #region schema
export const notesSchema = pgSchema('notes')

export const notes = notesSchema.table('notes', {
  id: idColumn(),
  spaceId: uuid('space_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  ...timestamps(),
})

export const noteCounts = notesSchema.table('note_counts', {
  spaceId: uuid('space_id').primaryKey(),
  count: integer('count').notNull().default(0),
})
// #endregion schema

// #region migration
export const createNotes = defineMigration({
  id: '0001_create_notes',
  up: /* sql */ `
    create schema notes;
    create table notes.notes (
      id uuid primary key,
      space_id uuid not null,
      title text not null,
      body text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index notes_space_created_idx on notes.notes (space_id, created_at);
    create table notes.note_counts (
      space_id uuid primary key,
      count integer not null default 0
    );
  `,
})
// #endregion migration

// #region event
export const noteCreated = defineEvent({
  type: 'note.created',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ noteId: z.string(), spaceId: z.string(), title: z.string() }),
  description: 'A note was created in a space.',
})
// #endregion event

// #region routes
const createNoteInput = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(10_000).default(''),
})

const routes = new Hono<ModuleHonoEnv>()
  .post('/:spaceId/notes', idempotent(), async (c) => {
    const spaceId = c.req.param('spaceId')
    if (!isId(spaceId)) throw new NotFoundError('Space not found')
    const input = await validate(createNoteInput, await c.req.json())

    const note = await withTransaction(c.var.services.get(DATABASE), async (tx) => {
      const [row] = await tx
        .insert(notes)
        .values({ spaceId, ...input })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      await c.var.services
        .get(EVENT_BUS)
        .emit(
          noteCreated,
          { noteId: row.id, spaceId, title: row.title },
          { transaction: toTransactionScope(tx) },
        )
      return row
    })
    return c.json(note, 201)
  })
  .get('/:spaceId/notes/:id', async (c) => {
    const { spaceId, id } = c.req.param()
    if (!isId(spaceId) || !isId(id)) throw new NotFoundError('Note not found')
    const [note] = await c.var.services
      .get(DATABASE)
      .select()
      .from(notes)
      .where(and(tenantScope(notes, { spaceId }), eq(notes.id, id)))
    if (note === undefined) throw new NotFoundError('Note not found')
    return c.json(note)
  })
// #endregion routes

// #region subscription
const countNotes = subscribe(
  noteCreated,
  'count-notes',
  async (envelope, context) => {
    const tx = fromTransactionScope(context.transaction ?? missingTransaction())
    await tx.execute(sql`
      insert into notes.note_counts (space_id, count) values (${envelope.payload.spaceId}::uuid, 1)
      on conflict (space_id) do update set count = notes.note_counts.count + 1`)
  },
  { idempotency: 'transactional' },
)

function missingTransaction(): never {
  throw new Error('count-notes runs with transactional idempotency')
}
// #endregion subscription

// #region module
export const notesModule = defineModule({
  meta: {
    name: '@acme/notes',
    version: '1.0.0',
    requiresCapabilities: ['blixis.database', 'blixis.events'],
  },
  migrations: [createNotes],
  rest: { path: '/spaces', app: routes },
  events: [countNotes],
})
// #endregion module
