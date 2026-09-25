# Postman

A Postman collection and environments for the Blixis API live in [`tooling/postman/`](../../tooling/postman/). The test suite checks them against the routes the API really registers, so they stay in sync.

Related: [Getting started](./getting-started.md) · [Authentication (manual)](../../apps/docs/src/content/docs/concepts/authentication.mdx) · [ADR 0009](../decisions/0009-authentication.md)

---

## Files

| File | Contents |
|---|---|
| `blixis.postman_collection.json` | All `/api/v1` endpoints, in run order: Health, Auth, Users, Organizations, Spaces, Environments & locales, Members, Cleanup (deletes the space it created), API tokens, and Sign out |
| `local.postman_environment.json` | `baseUrl = http://localhost:8787` (`pnpm dev`) |
| `staging.postman_environment.json` | `baseUrl = https://blixis-api-staging.frosty-hill-6079.workers.dev` |
| `production.postman_environment.json` | `baseUrl` empty until the custom domain exists |

## Setup

1. In Postman: **Import** → select the four files.
2. Pick an environment (top right).
3. Set the **current values** of `email`, `password`, and `displayName` in that environment. **Never fill in initial values**: those are shared when you export or sync a workspace. `password`, `accessToken`, and `refreshToken` are *secret* variables (masked).
4. Run **Auth → Sign in**.

From then on, every request sends `Authorization: Bearer {{accessToken}}`, which is set at collection level. The collection's pre-request script refreshes the access token automatically when it expires within 30 seconds, and stores the rotated refresh token. If a refresh fails, the tokens are cleared: sign in again.

Postman uses `"tokenDelivery": "body"`, so the refresh token comes back in the JSON body instead of the browser cookie (ADR 0009).

## Variables

| Variable | Set by | Meaning |
|---|---|---|
| `baseUrl` | environment file | API origin, without `/api/v1` |
| `email`, `password`, `displayName` | you (current value) | Credentials of your user. Create it with `pnpm auth:create-user` |
| `accessToken`, `accessTokenExpiresAt` | Sign in / Refresh scripts | JWT (15 min) and its expiry in ms |
| `refreshToken` | Sign in / Refresh scripts | Opaque `blx_rt_…`; rotates on every refresh |
| `userId` | Sign in script | Your user's ID |
| `organizationId`, `spaceId` | Create organization / Create space scripts | The organization and space the later requests use |
| `memberEmail` | you (current value) | Email of **another existing user** to add in *Members*. Without it those requests are skipped with 404/400 |
| `localeId` | Create locale script | For update and delete |
| `orgMembershipId`, `spaceMembershipId` | Add member scripts | For change-role and remove |
| `roleId` | Create custom role script | For update and delete in *Roles* |
| `entryId`, `entryVersion` | Create entry / Update entry scripts | The entry requests; `entryVersion` is sent as `If-Match` |
| `versionId` | List entry versions script | The oldest version, for *Restore first version* |
| `componentId`, `contentTypeId`, `contentTypeVersion` | Create component / Create content type / Update scripts | The *Content model* requests; `contentTypeVersion` is sent back on update (optimistic concurrency) |
| `apiToken`, `apiTokenId` | Create API token script | The last created personal API token, shown once and stored as a secret, and its ID for *Revoke* |

## Command line

Run the whole collection with Newman, Postman's CLI runner. For example, against local `pnpm dev`:

```bash
read -rs "PW?Password: "; echo
npx newman run tooling/postman/blixis.postman_collection.json \
  -e tooling/postman/local.postman_environment.json \
  --env-var email=you@example.com --env-var "password=$PW" --env-var "displayName=You"
unset PW
```

## Keeping it in sync

`tooling/postman/src/collection.test.ts` loads the API's real module list (`apps/api/src/blixis.config.ts`) and fails when:
- a collection request points at a route the API doesn't register (a renamed or removed endpoint);
- an API route has no request in the collection (a new endpoint was added without one);
- the environments differ in variables, or an environment file contains a value other than `baseUrl` (no committed credentials or tokens).

When you add an endpoint, add a request with at least a status test to the matching folder, either in Postman (then export the collection as v2.1 over the file) or by editing the JSON.
