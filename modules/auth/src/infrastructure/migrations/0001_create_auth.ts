import { defineMigration } from '@blixis/contracts'

/**
 * Credentials and refresh tokens (ADR 0009). Only hashes are stored. `user_id` references
 * `users.users` — allowed because `@blixis/auth` requires `@blixis/users` (ADR 0007 §8).
 */
export const createAuth = defineMigration({
  id: '0001_create_auth',
  up: /* sql */ `
    create schema auth;
    create table auth.credentials (
      user_id uuid primary key references users.users (id) on delete restrict,
      password_hash text not null,
      updated_at timestamptz not null default now()
    );
    create table auth.refresh_tokens (
      id uuid primary key,
      token_hash text not null,
      family_id uuid not null,
      user_id uuid not null references users.users (id) on delete restrict,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      family_expires_at timestamptz not null,
      rotated_at timestamptz,
      revoked_at timestamptz,
      user_agent text,
      constraint refresh_tokens_hash_key unique (token_hash)
    );
    create index refresh_tokens_family_idx on auth.refresh_tokens (family_id);
    create index refresh_tokens_user_idx on auth.refresh_tokens (user_id);
    create index refresh_tokens_expires_idx on auth.refresh_tokens (family_expires_at);
  `,
})
