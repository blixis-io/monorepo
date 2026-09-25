import { defineMigration } from '@blixis/contracts'

/**
 * Delivery and preview keys (plan 012.004): space-scoped credentials for reading content through
 * the delivery API. Only the SHA-256 hash of a key is stored, plus a display prefix.
 * `environment_ids` null means every environment of the space.
 */
export const createDeliveryKeys = defineMigration({
  id: '0004_create_delivery_keys',
  up: /* sql */ `
    create table auth.delivery_keys (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      kind text not null check (kind in ('delivery', 'preview')),
      name text not null,
      prefix text not null,
      key_hash text not null,
      environment_ids uuid[],
      created_by text not null,
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked_at timestamptz,
      constraint delivery_keys_hash_key unique (key_hash)
    );
    create index delivery_keys_space_idx on auth.delivery_keys (space_id, created_at);
  `,
})
