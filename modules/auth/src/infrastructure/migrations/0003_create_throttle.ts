import { defineMigration } from '@blixis/contracts'

/**
 * Sign-in throttling counters (007.006). Keys are SHA-256 hashes of `email:<normalized>` and
 * `ip:<address>` — no plain emails or IPs are stored.
 */
export const createThrottle = defineMigration({
  id: '0003_create_throttle',
  up: /* sql */ `
    create table auth.sign_in_throttle (
      key_hash text primary key,
      failures integer not null default 0,
      window_started_at timestamptz not null default now(),
      locked_until timestamptz
    );
    create index sign_in_throttle_window_idx on auth.sign_in_throttle (window_started_at);
  `,
})
