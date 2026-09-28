import { defineMigration } from '@blixis-io/contracts'

/**
 * Every HTTP attempt of a delivery (plan 015.003): outcome, timing, and at most 1 KB of the
 * receiver's response — never request or response headers, never the secret.
 */
export const createAttempts = defineMigration({
  id: '0003_create_attempts',
  up: /* sql */ `
    create table webhooks.attempts (
      id uuid primary key,
      organization_id uuid not null,
      space_id uuid not null,
      delivery_id uuid not null references webhooks.deliveries (id) on delete cascade,
      number integer not null,
      started_at timestamptz not null,
      duration_ms integer not null,
      status_code integer,
      error text,
      response_excerpt text,
      created_at timestamptz not null default now()
    );
    create index attempts_delivery_idx on webhooks.attempts (delivery_id, number);
  `,
})
