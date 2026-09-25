import { defineMigration } from '@blixis/contracts'

/** Personal API tokens (ADR 0009 §7): only the SHA-256 hash is stored, plus a display prefix. */
export const createApiTokens = defineMigration({
  id: '0002_create_api_tokens',
  up: /* sql */ `
    create table auth.api_tokens (
      id uuid primary key,
      user_id uuid not null references users.users (id) on delete restrict,
      name text not null,
      prefix text not null,
      token_hash text not null,
      scopes text[] not null default '{}',
      expires_at timestamptz,
      last_used_at timestamptz,
      created_at timestamptz not null default now(),
      revoked_at timestamptz,
      constraint api_tokens_hash_key unique (token_hash)
    );
    create index api_tokens_user_idx on auth.api_tokens (user_id, created_at);
  `,
})
