import { defineMigration } from '@blixis/contracts'

/**
 * Plan 009: memberships reference roles of `@blixis/permissions` — a system role key (`owner`,
 * `admin`, `editor`, `viewer`) or a custom role id. The plan-008 organization role `member`
 * (read access to the organization and its spaces) becomes `viewer`.
 */
export const systemRoleKeys = defineMigration({
  id: '0003_system_role_keys',
  up: /* sql */ `
    update users.memberships set role_key = 'viewer', updated_at = now()
    where space_id is null and role_key = 'member';
    create index memberships_role_idx on users.memberships (organization_id, role_key);
  `,
})
