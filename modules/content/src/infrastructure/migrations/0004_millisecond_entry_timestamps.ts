import { defineMigration } from '@blixis/contracts'

/**
 * Entry timestamps at millisecond precision. List cursors carry `updated_at` as an ISO string
 * (JavaScript dates have milliseconds), but `now()` stores microseconds: two entries saved within
 * one millisecond could fall between pages and be skipped. Storing milliseconds makes the cursor
 * exact; ties are ordered by id. Existing values are rounded to the nearest millisecond.
 */
export const millisecondEntryTimestamps = defineMigration({
  id: '0004_millisecond_entry_timestamps',
  up: /* sql */ `
    alter table content.entries
      alter column created_at type timestamptz(3),
      alter column updated_at type timestamptz(3),
      alter column published_at type timestamptz(3),
      alter column first_published_at type timestamptz(3);
  `,
})
