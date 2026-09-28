# @blixis-example/seo

An example third-party Blixis module (plan 018.003): SEO metadata for entries. It exists to prove the extension contract (§42 Stage 8, §52): it uses **only public packages** (`@blixis-io/contracts`, `@blixis-io/kernel`, `@blixis-io/content-api`, `@blixis-io/database`), and it installs Blixis from packed tarballs, as a third party installs from npm.

What it contributes:

| Extension point | Here |
|---|---|
| Options and config schema | `seo({ defaultTitle })`, validated at startup |
| Capabilities | provides `example.seo`; requires `blixis.database`, `blixis.content`, `blixis.permissions` |
| Service | `SEO_SERVICE` (request-scoped), usable by other modules |
| REST | `GET` and `PUT /api/v1/entries/:entryId/seo`, with operations for OpenAPI |
| GraphQL | `seo { title description }` on every delivered entry's `sys` |
| Permissions | `seo.read` (admin, editor, viewer), `seo.write` (admin, editor) |
| Events | `entry.published` (records the time), `entry.deleted` and `space.deleted` (cleanup) |
| Migration | `0001_create_seo`: its own `example_seo` schema |

## Use it in an app

```bash
pnpm add @blixis-example/seo      # once published; here: the packed tarball
```

```ts title="apps/api/src/blixis.config.ts"
import seo from '@blixis-example/seo'

export const modules = [
  // … first-party modules, including content() and permissionsModule()
  seo({ defaultTitle: 'My site' }),
]
```

Run the migrations (`pnpm db:migrate`), deploy, and query `{ page(id: "…") { sys { seo { title } } } }`.

## Develop and test it

It is its own pnpm project (see `pnpm-workspace.yaml` here), outside the monorepo's workspace:

```bash
pnpm pack:public                          # at the repository root: build and pack into .artifacts/ (names without versions)
cd examples/blixis-example-seo
pnpm install --no-frozen-lockfile         # installs @blixis/* from the tarballs
pnpm typecheck
BLIXIS_TEST_DATABASE_URL=postgres://blixis:blixis@localhost:5432/blixis pnpm test
```

The tests boot the plugin with first-party modules (users, spaces, permissions, content, GraphQL) on a real Postgres database. `pnpm boundaries` at the root checks that `src/` imports only public packages.

This module is **trusted code**: once installed, it runs with the Worker's full permissions (see the manual: Extending → Security model).
