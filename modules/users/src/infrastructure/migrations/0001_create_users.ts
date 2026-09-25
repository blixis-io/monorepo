import { defineMigration } from '@blixis/contracts'

/** Users are global identities (not tenant-scoped); emails are stored normalized. */
export const createUsers = defineMigration({
  id: '0001_create_users',
  up: /* sql */ `
    create schema users;
    create table users.users (
      id uuid primary key,
      email text not null,
      display_name text not null,
      status text not null default 'active' check (status in ('active', 'disabled')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint users_email_key unique (email),
      constraint users_email_normalized check (email = lower(btrim(email)))
    );
  `,
})
