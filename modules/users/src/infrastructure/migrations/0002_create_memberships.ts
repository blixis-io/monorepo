import { defineMigration } from '@blixis/contracts'

/**
 * Memberships link users to organizations (`space_id` null) or spaces (§20: owned by users).
 * No foreign keys to `@blixis/spaces` tables — users does not depend on spaces; tenant ids are
 * validated by the spaces services that create memberships. `nulls not distinct` makes the
 * organization-level row (null `space_id`) unique per user too.
 */
export const createMemberships = defineMigration({
  id: '0002_create_memberships',
  up: /* sql */ `
    create table users.memberships (
      id uuid primary key,
      user_id uuid not null references users.users (id) on delete restrict,
      organization_id uuid not null,
      space_id uuid,
      role_key text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint memberships_user_tenant_key unique nulls not distinct (user_id, organization_id, space_id)
    );
    create index memberships_tenant_idx on users.memberships (organization_id, space_id);
  `,
})
