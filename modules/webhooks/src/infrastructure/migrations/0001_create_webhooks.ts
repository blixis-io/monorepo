import { defineMigration } from '@blixis/contracts'

/**
 * Webhook configurations per space (plan 015.001). The signing secret is stored encrypted
 * (AES-GCM, key from the `WEBHOOK_SECRET_KEYS` Worker secret) and never returned after creation.
 */
export const createWebhooks = defineMigration({
  id: '0001_create_webhooks',
  up: /* sql */ `
    create schema webhooks;

    create table webhooks.webhooks (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      environment_id uuid,
      name text not null,
      url text not null,
      event_types text[] not null,
      secret_encrypted text not null,
      secret_hint text not null,
      active boolean not null default true,
      failure_count integer not null default 0,
      disabled_reason text,
      version integer not null default 1,
      created_by text not null,
      updated_by text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint webhooks_event_types_not_empty check (cardinality(event_types) > 0)
    );
    create index webhooks_space_idx on webhooks.webhooks (space_id) where active;
  `,
})
