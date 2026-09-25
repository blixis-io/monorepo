import { defineMigration } from '@blixis/contracts'

/**
 * The tenant hierarchy (§21). Child tables carry `organization_id` too (ADR 0007: tenant
 * columns on every table, so every query can be scoped without joins).
 */
export const createSpaces = defineMigration({
  id: '0001_create_spaces',
  up: /* sql */ `
    create schema spaces;

    create table spaces.organizations (
      id uuid primary key,
      name text not null,
      slug text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint organizations_slug_key unique (slug)
    );

    create table spaces.spaces (
      id uuid primary key,
      organization_id uuid not null references spaces.organizations (id) on delete restrict,
      name text not null,
      slug text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint spaces_org_slug_key unique (organization_id, slug)
    );

    create table spaces.environments (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null references spaces.spaces (id) on delete restrict,
      key text not null,
      is_default boolean not null default false,
      created_at timestamptz not null default now(),
      constraint environments_space_key_key unique (space_id, key)
    );
    create unique index environments_one_default_idx on spaces.environments (space_id) where is_default;

    create table spaces.locales (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null references spaces.spaces (id) on delete restrict,
      code text not null,
      name text not null,
      is_default boolean not null default false,
      fallback_code text,
      created_at timestamptz not null default now(),
      constraint locales_space_code_key unique (space_id, code)
    );
    create unique index locales_one_default_idx on spaces.locales (space_id) where is_default;
  `,
})
