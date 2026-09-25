# 0009 — Authentication: custom JWT access tokens with rotating refresh tokens

- Status: accepted
- Date: 2026-09-25
- Roadmap task: [007.001](../plans/007-identity-and-authentication/001-select-authentication-approach.md)

## Context

§30 separates authentication (who is the actor?) from authorization (plan 009). Blixis needs three kinds of actor:
- browser users of the admin UI (plan 019);
- automation with personal API tokens;
- anonymous callers.

Constraints:
- it runs on Workers with Web Crypto only (no Node crypto KDFs, no runtime WASM compilation);
- the API bundle budget is 1024 KiB gzip, with the API at 339 KiB today;
- tables are module-owned with UUIDv7 IDs (ADR 0007);
- events go through `@blixis/events`.

The roadmap suggested Postgres-backed opaque sessions. The project owner chose **JWT with refresh tokens**.

## Spike (workerd, 2026-09-25)

| Check | Result |
|---|---|
| Better Auth 1.7.6 + Drizzle adapter, minimal Worker | 413 KiB gzip total (about **+330 KiB** over pg + Drizzle). Pulls in Kysely, telemetry, and all database adapters; library-shaped tables and IDs |
| PBKDF2-SHA256, 100k / 600k iterations | ~7.5 ms / ~46 ms CPU. **Cloudflare caps PBKDF2 at 100k in production** (OWASP asks for 600k) |
| scrypt (`@noble/hashes`) N=2^14 r=8 / **N=2^15 r=8** / N=2^16 r=8 | ~48 / **~91** / ~187 ms CPU; memory 16 / 32 / 64 MiB |
| Argon2id (`hash-wasm`) | **Fails**: `WebAssembly.compile(): Wasm code generation disallowed by embedder` (Workers only allow statically imported WASM modules) |
| Ed25519 sign/verify via Web Crypto, including JWK import/export | Works in workerd and Node 24 (64-byte signatures) |

## Decision

1. **Custom implementation** in two modules: `@blixis/users`, which owns user records, and `@blixis/auth`, which owns credentials, refresh tokens, and API tokens. There is no auth library. The only new dependency is `@noble/hashes`, which is audited and has no dependencies.
2. **Access tokens are JWTs**, signed with **EdDSA (Ed25519)** through Web Crypto.
   - They live **15 minutes** and are sent as `Authorization: Bearer <jwt>`.
   - Claims: `iss` (API origin), `aud` (`blixis-api`), `sub` (user ID), `sid` (refresh-token family), `iat`, `exp`, `jti`. There are no roles or permissions in the token; authorization is looked up per request (plan 009), so a permission change applies immediately.
   - The header carries `kid`. Signing keys live in the Worker secret `AUTH_SIGNING_KEYS` (a JSON array of private JWKs; the first one signs, all of them verify), so keys can be rotated without logging everyone out. The public keys are published at `GET /api/v1/auth/jwks`.
   - Verification is strict: `alg` must be `EdDSA`; `typ`, `iss`, `aud`, `exp`, and `nbf` are checked with 30 s of leeway; unknown `kid`s are rejected. `alg: none` and HMAC confusion are impossible by construction.
3. **Refresh tokens are opaque**: 32 random bytes, base64url.
   - Postgres stores only their **SHA-256 hash**, together with the token family, user, expiry, `rotated_at`, and `revoked_at`.
   - They live **30 days** (sliding), capped at **90 days** per family.
   - **They are rotated on every use**: the old token is marked rotated and a new one is issued in the same family. **Presenting an already-rotated token revokes the whole family** (theft detection); a 10 s grace window covers concurrent tabs refreshing at once.
   - Sign-out revokes the family. A password change or reset revokes all the user's families.
4. **Transport:**
   - **Browsers:** the refresh token goes in an `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie (`__Host-` prefix once a custom domain exists). The access token is returned in the JSON body and kept **in memory** by the client, never in `localStorage`.
   - **Non-browser clients** receive the refresh token in the body with `{ "tokenDelivery": "body" }`.
5. **CSRF:** API requests authenticate with the `Authorization` header, not cookies, so they aren't exposed to CSRF. The cookie-using endpoints (`refresh`, `sign-out`) additionally require an `Origin` that matches an allow-list and a JSON content type.
6. **Passwords** are hashed with **scrypt N=2^15, r=8, p=1, 32-byte key, 16-byte random salt** (`@noble/hashes`; ~91 ms CPU, 32 MiB). The hash is stored in a versioned format: `scrypt$v=1$N=32768,r=8,p=1$<salt>$<hash>`. Parameters are upgraded by rehashing on the next sign-in. Passwords are 12–256 characters with no composition rules, and are checked against a small list of common passwords (NIST SP 800-63B). Comparisons are constant-time.
7. **Personal API tokens** stay **opaque**: `blx_pat_<32 random bytes base64url>`. Only the SHA-256 hash is stored, along with a displayable prefix (`blx_pat_ab12…`), an optional expiry, and scopes (permission IDs, enforced by plan 009). The token is shown once at creation. The prefix separates them from JWTs.
8. **Actor resolution** (the kernel `actorResolver`, provided by `@blixis/auth`):
   - a `Bearer` JWT → `{ type: 'user', userId }`;
   - a `Bearer blx_pat_…` → `{ type: 'apiToken', tokenId, ownerId, scopes }`;
   - nothing → anonymous;
   - an invalid token → `401` (never silently anonymous).
9. **Brute force:** sign-in is throttled per account and per IP (007.006). Errors never reveal whether an email exists.
10. **Events:** `user.created` is transactional; `user.signed_in`, `user.signed_out`, and `api_token.created`/`revoked` are best-effort. Payloads never contain secrets.

## Consequences

- **Revocation lag:** after sign-out, a password change, or a revoked family, an already-issued access token remains valid until it expires, at most 15 minutes. This is the accepted trade-off of stateless access tokens. Sensitive operations (password change, API token creation) re-check the refresh family in the database.
- **Operations:**
  - Two new Worker secrets per environment: `AUTH_SIGNING_KEYS`, and an allow-list of `AUTH_ALLOWED_ORIGINS` (a var).
  - Key rotation: add a new key first, sign with it after a deploy, and remove the old key after 15 minutes.
- **Cost:** scrypt uses 32 MiB and ~91 ms CPU per sign-up or sign-in. Concurrent sign-ins in one isolate multiply the memory; throttling bounds it. It is revisited if Workers allow Argon2id as a static WASM module.
- **Bundle:** about +20 KiB (`@noble/hashes` scrypt plus our code), far below Better Auth's +330 KiB.
- **Features we own:** future OAuth, 2FA, and passkeys are built as modules on top. This is more work than library plugins, but it keeps full control over the schema, IDs, and events.

## Alternatives considered

- **Better Auth:** mature, with plugins (OAuth, 2FA, passkeys). Rejected for bundle size (+330 KiB), a library-owned schema and IDs, and heavier dependencies.
- **Opaque server-side sessions** (the roadmap's recommendation): instant revocation, but a database lookup on every request. The owner prefers JWT access tokens; short expiry plus family revocation limits the downside.
- **HS256 (shared secret):** simpler, but anything that can verify can also mint tokens. EdDSA lets other services verify through the JWKS.
- **PBKDF2 100k + pepper:** fast and native, but not memory-hard and below OWASP guidance without the pepper.
- **Argon2id:** preferred by OWASP, but not feasible on Workers without bundling a static WASM module. It may be revisited.
