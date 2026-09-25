import { defineMigration } from '@blixis/contracts'

/**
 * Content types and components per environment (ADR 0010 §1). Fields and groups are JSONB
 * arrays: a type is always read and written whole, and `version` guards concurrent edits.
 */
export const createContentTypes = defineMigration({
  id: '0001_create_content_types',
  up: /* sql */ `
    create schema content;

    create table content.content_types (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      kind text not null check (kind in ('entry', 'component')),
      api_id text not null,
      name text not null,
      description text not null default '',
      display_field_id text,
      groups jsonb not null default '[]',
      fields jsonb not null default '[]',
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint content_types_environment_api_id_key unique (environment_id, api_id)
    );
    create index content_types_tenant_idx on content.content_types (space_id, environment_id);
  `,
})
