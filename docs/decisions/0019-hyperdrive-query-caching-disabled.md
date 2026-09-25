# 0019 — Hyperdrive query caching is disabled

- Status: accepted
- Date: 2026-09-25
- Roadmap task: none (staging finding during plan 009; see [009 technical notes](../plans/009-authorization-and-permissions/_index.md))

## Context

Hyperdrive caches the results of read queries by default (`max_age` 60 s). A cached answer is keyed on the SQL text and its parameters, not on the rows it read, so a write doesn't invalidate it.

Blixis reads authorization and authentication state through ordinary `SELECT`s:
- memberships;
- custom roles;
- API tokens and refresh tokens;
- sign-in throttle counters;
- user status.

**Found on staging, 2026-09-25, plan 009:**
- The authorization service loads a user's memberships with one query per user (`listMembershipsForUser`). Right after creating an organization, the owner got `404` on it for about 40 s, until the cached empty membership list expired.
- Newman against staging failed until then. Tests and local `wrangler dev` didn't show it, because they connect to Postgres directly.

The same caching would also delay the effect of security-relevant writes by up to a minute:
- a removed member, or a role change;
- a revoked API token;
- a rotated refresh token (theft detection);
- a disabled user;
- throttle counts.

## Decision

1. **Every Hyperdrive configuration has query caching disabled** (`caching.disabled: true`). Staging `2140b66b…` and production `01eefb16…` were switched on 2026-09-25 with `wrangler hyperdrive update <id> --caching-disabled`. New configurations are created with `--caching-disabled` ([database operations](../operations/database.md#where-connection-strings-live)).
2. Hyperdrive stays for what we use it for: connection pooling and the low-latency path from Workers to Neon.
3. Read caching for content delivery is done above the database, with explicit, event-driven invalidation (plan 013, architecture §34). It never happens in the database layer.

## Alternatives considered

- **Keep caching and bypass it for sensitive queries:** relies on Hyperdrive's rules for which queries aren't cached (volatile functions, transactions). Every auth read would need to follow them, which is fragile and easy to forget in a new module.
- **Shorter `max_age`:** narrows the window but doesn't close it. Stale authorization for any length of time is unacceptable.
- **Keep caching and accept 60 s staleness:** it breaks read-your-writes for every API client, and delays revocation.

## Consequences

- Every query reaches Neon. Warm latency stays in the measured 7–15 ms range (CP2b), and load is bounded by the pool (`origin_connection_limit` 60).
- Read-your-writes holds for all API clients.
- This is an operational setting outside the repository. The operations docs list it in the Hyperdrive checklist, and the staging Newman run (a create followed immediately by a read) detects a regression.
