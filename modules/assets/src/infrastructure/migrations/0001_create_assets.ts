import { defineMigration } from '@blixis/contracts'

/**
 * Asset metadata per environment (§17, ADR 0013). The binary lives in object storage under
 * `object_key`; this row is the source of truth. `pending` rows are uploads in progress.
 */
export const createAssets = defineMigration({
  id: '0001_create_assets',
  up: /* sql */ `
    create schema assets;

    create table assets.assets (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      status text not null check (status in ('pending', 'ready')),
      filename text not null,
      title jsonb not null default '{}',
      description jsonb not null default '{}',
      mime_type text not null,
      size_bytes bigint check (size_bytes >= 0),
      sha256 text,
      width integer,
      height integer,
      object_key text not null unique,
      version integer not null default 1,
      published_at timestamptz,
      first_published_at timestamptz,
      created_by text not null,
      updated_by text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint assets_ready_has_size check (status = 'pending' or size_bytes is not null),
      constraint assets_published_is_ready check (published_at is null or status = 'ready')
    );
    create index assets_listing_idx on assets.assets (environment_id, updated_at desc, id desc);
    create index assets_pending_idx on assets.assets (created_at) where status = 'pending';
  `,
})
