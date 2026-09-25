import { defineMigration } from '@blixis/contracts'

/**
 * Custom roles per organization (plan 009). System roles live in code and are never stored.
 * Permission ids are a `text[]`: a role is always read and written whole, and ids of modules
 * that are no longer installed are ignored at evaluation time.
 */
export const createRoles = defineMigration({
  id: '0001_create_roles',
  up: /* sql */ `
    create schema permissions;

    create table permissions.roles (
      id uuid primary key,
      organization_id uuid not null,
      name text not null,
      description text not null default '',
      permissions text[] not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index roles_org_name_key on permissions.roles (organization_id, lower(name));
  `,
})
