import { defineMigration } from '@blixis-io/contracts'

/**
 * One row per (webhook, event): the unique pair makes fan-out idempotent — a redelivered event
 * inserts nothing (plan 015.002). `payload` is the public body sent to the endpoint.
 */
export const createDeliveries = defineMigration({
  id: '0002_create_deliveries',
  up: /* sql */ `
    create table webhooks.deliveries (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      webhook_id uuid not null references webhooks.webhooks (id) on delete cascade,
      event_id uuid not null,
      event_type text not null,
      payload jsonb not null,
      status text not null default 'pending'
        check (status in ('pending', 'succeeded', 'failed', 'abandoned')),
      attempts integer not null default 0,
      next_attempt_at timestamptz,
      last_status_code integer,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint deliveries_webhook_event_key unique (webhook_id, event_id)
    );
    create index deliveries_webhook_idx on webhooks.deliveries (webhook_id, created_at desc, id desc);
    create index deliveries_due_idx on webhooks.deliveries (next_attempt_at) where status = 'pending';
  `,
})
