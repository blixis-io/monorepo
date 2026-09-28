# 0020 — npm scope `@blixis-io`, MIT licence, published package set

- Status: accepted
- Date: 2026-09-28
- Roadmap task: [018.005](../plans/018-extension-platform/005-package-versioning-and-publishing.md) (decision register D20)

## Context

Third-party modules install Blixis from npm (§25, plan 018). The roadmap assumed the `@blixis` scope, and the workspace named every package `@blixis/<name>`. The project owner created the npm organization **`blixis-io`** instead, chose the licence, and asked for a sensible published set.

Blixis also uses names of the form `@blixis/<name>` at runtime: module names (`meta.name`, recorded per migration in the migrations table), module requirements (`requires: { '@blixis/spaces': … }`), service token ids (`@blixis/content.entries`), event handler and log component ids. These are identifiers, not npm package names.

## Decision

1. **npm scope: `@blixis-io`.** Every workspace package is named `@blixis-io/<name>` (published or not), so imports, docs, and published names are the same everywhere.
2. **Runtime identifiers keep `@blixis/…`.** Module names, `requires`, token ids, and other ids stay as they are: changing a module name would make the migration runner treat applied migrations as new, and token ids are shared across packages through `Symbol.for`. `ModuleMeta.name` is documented as a module identifier, not necessarily the package name.
3. **Licence: MIT** (chosen by the owner), for the repository and every published package.
4. **Published set:** the public platform packages that third-party modules and API clients need: `@blixis-io/contracts`, `@blixis-io/kernel`, `@blixis-io/content-api`, `@blixis-io/database`, `@blixis-io/testing`, and `@blixis-io/sdk`, plus `@blixis-io/events` and `@blixis-io/shared`, which `testing` and `database` depend on. First-party modules (content, assets, auth, …), `cloudflare`, and `graphql` are `private` until third parties need them; publishing more later is additive. A boundary rule (`published-dependency`) keeps published packages from depending on unpublished ones.
5. **One copy per app:** published packages take other Blixis packages (except the stateless `shared`), `drizzle-orm`, and `hono` as **peer dependencies**. Two copies of contracts would break `instanceof` on errors; two of Drizzle would break its types. Enforced by `published-dependency`.
6. **Versioning (018.005):** release-please in manifest mode, one component per package, **linked versions** (all published packages share one version, so their peer ranges always match — before 1.0, `^0.1.0` doesn't match `0.2.0`). Tags are `<package>-vX.Y.Z`, distinct from platform tags `vX.Y.Z` (plan 021), so package releases never deploy the platform.
7. **Publishing:** the `release-packages` workflow packs each released package with pnpm (resolving `workspace:` and `catalog:`) and publishes it with `npm publish --provenance`, through npm trusted publishing (OIDC) in the `npm` environment; a one-time `NPM_TOKEN` covers the first publish, since trusted publishers can only be configured for existing packages.

## Consequences

- One rename of all package names and import specifiers (no behavior change), verified by the full test suite, the plugin gate from tarballs, and the Worker bundles.
- Module names and package names differ for first-party modules (`@blixis/content` is published, if ever, as `@blixis-io/content`). Third-party modules usually use their package name as module name; both must just be unique.
- Publishing is additive: packages outside the set can be published later without renames.
