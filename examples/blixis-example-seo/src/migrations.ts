import { defineMigration } from '@blixis-io/contracts'

/** Creates the plugin's schema. Migration ids are unique per module and never change. */
export const createSeo = defineMigration({
  id: '0001_create_seo',
  up: /* sql */ `
    create schema example_seo;
    create table example_seo.entries (
      entry_id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid not null,
      title text,
      description text,
      last_published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index entries_space_idx on example_seo.entries (organization_id, space_id);
  `,
})
