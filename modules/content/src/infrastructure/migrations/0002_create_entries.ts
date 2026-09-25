import { defineMigration } from '@blixis/contracts'

/**
 * Entries with immutable versions (§22, ADR 0010, plan 011). An entry points at its current draft
 * version and, when published, at its published version. Versions are never updated; publishing
 * history and outgoing links are kept per version.
 */
export const createEntries = defineMigration({
  id: '0002_create_entries',
  up: /* sql */ `
    create table content.entries (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      content_type_id uuid not null references content.content_types (id) on delete restrict,
      current_version_id uuid not null,
      version integer not null default 1,
      published_version_id uuid,
      published_at timestamptz,
      first_published_at timestamptz,
      created_by text not null,
      updated_by text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index entries_listing_idx
      on content.entries (environment_id, content_type_id, updated_at desc, id desc);
    create index entries_environment_updated_idx
      on content.entries (environment_id, updated_at desc, id desc);

    create table content.entry_versions (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      entry_id uuid not null references content.entries (id) on delete cascade,
      number integer not null,
      fields jsonb not null,
      content_type_version integer not null,
      restored_from uuid,
      created_by text not null,
      created_at timestamptz not null default now(),
      constraint entry_versions_entry_number_key unique (entry_id, number)
    );
    create index entry_versions_fields_idx on content.entry_versions using gin (fields jsonb_path_ops);

    create table content.entry_publications (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      entry_id uuid not null references content.entries (id) on delete cascade,
      version_id uuid,
      action text not null check (action in ('publish', 'unpublish')),
      actor text not null,
      at timestamptz not null default now()
    );
    create index entry_publications_entry_idx on content.entry_publications (entry_id, at desc);

    create table content.entry_references (
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      from_entry_id uuid not null references content.entries (id) on delete cascade,
      from_version_id uuid not null references content.entry_versions (id) on delete cascade,
      to_type text not null check (to_type in ('entry', 'asset')),
      to_id uuid not null,
      primary key (from_version_id, to_type, to_id)
    );
    create index entry_references_target_idx on content.entry_references (environment_id, to_type, to_id);
  `,
})
