import { defineMigration } from '@blixis/contracts'

/** UI preferences per user (plan 019): one JSON document, validated by the service. */
export const createPreferences = defineMigration({
  id: '0004_create_preferences',
  up: /* sql */ `
    create table users.preferences (
      user_id uuid primary key references users.users (id) on delete cascade,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );
  `,
})
