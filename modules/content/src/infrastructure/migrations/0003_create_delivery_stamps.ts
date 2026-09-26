import { defineMigration } from '@blixis/contracts'

/**
 * The content stamp of each space (ADR 0012 §1): part of every delivery cache key, bumped when
 * published content, the model, or locales change. Only ever moves forward.
 */
export const createDeliveryStamps = defineMigration({
  id: '0003_create_delivery_stamps',
  up: /* sql */ `
    create table content.delivery_stamps (
      space_id uuid primary key,
      organization_id uuid not null,
      stamp bigint not null default 0,
      updated_at timestamptz not null default now()
    );
  `,
})
