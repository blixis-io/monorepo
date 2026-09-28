# 019.005 — Let users choose and import themes (tweakcn)

## Status

```text
completed
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Every user configures their own admin appearance: a color scheme and a theme, from the [tweakcn](https://tweakcn.com) presets or imported from the tweakcn editor, saved to their account. Added at the owner's request on 2026-09-28.

## Background

019.001 set up shadcn/ui theme tokens; 019.002 the browser session.

## Requirements

- Per-user preferences stored by the API (`GET/PUT /api/v1/users/me/preferences`), with strict validation of theme values.
- The tweakcn presets, vendored with attribution (Apache-2.0), loaded lazily.
- Import of CSS exported by the tweakcn editor.
- Applied under the admin's Content-Security-Policy; light and dark tokens per theme.

## Architectural constraints

- The admin still talks to the API only through `@blixis/sdk`; theme data never loads resources.

## Files and folders

### Create

```text
modules/users/src/domain/preferences.ts
modules/users/src/infrastructure/migrations/0004_create_preferences.ts
apps/admin/src/lib/themes/tokens.ts
apps/admin/src/lib/themes/tokens.test.ts
apps/admin/src/lib/themes/tweakcn-presets.ts (generated)
apps/admin/src/lib/appearance.ts
apps/admin/src/lib/appearance-context.tsx
apps/admin/src/routes/appearance.tsx
apps/admin/scripts/import-tweakcn-presets.ts
apps/admin/test/appearance.test.tsx
apps/admin/THIRD_PARTY_NOTICES.md
docs/plans/019-admin-ui-foundation/005-user-themes.md
```

### Modify

```text
modules/users/src/{application/user.service.ts,infrastructure/schema.ts,infrastructure/user.repository.ts,module.ts,rest/operations.ts,rest/routes.ts,index.ts}
modules/users/test/users.test.ts
apps/api/openapi.json, packages/sdk/src/generated/api.ts (generated)
packages/sdk/src/client.ts (me namespace)
tooling/postman/blixis.postman_collection.json
apps/admin/src/{styles.css,app.tsx,main.tsx,routes/router.tsx,components/theme-toggle.tsx,components/user-menu.tsx}
apps/admin/src/components/ui/{card,dialog,dropdown-menu,toaster}.tsx
apps/admin/test/{app.test.tsx,fake-api.ts}
apps/admin/e2e/sign-in.spec.ts
apps/admin/README.md
apps/docs/src/content/docs/concepts/authentication.mdx
biome.json
docs/ROADMAP.md, docs/plans/019-admin-ui-foundation/_index.md
```

### Delete

```text
apps/admin/src/lib/theme.ts (replaced by appearance.ts)
```

## Dependencies

Requires:

- [019.002 — Implement admin authentication and navigation shell](./002-admin-auth-and-shell.md)

## Acceptance criteria

- [x] A user picks a preset or imports tweakcn CSS; it applies at once and follows them to another browser.
- [x] Unsafe theme values are rejected by the API and skipped by the admin.

## Validation

```bash
pnpm test:db
pnpm --filter @blixis/admin test
pnpm --filter @blixis/admin e2e
```

## Technical notes

- **Storage:** `users.preferences` (one JSON document per user, `on delete cascade`), `USER_SERVICE.getPreferences/updatePreferences`, `PUT` replaces (omitted fields reset). Schemas `UserPreferences` and `Theme` in OpenAPI; SDK `client.me.preferences()` / `updatePreferences()`. Staging needs `pnpm db:migrate` (users 0004) before the deploy.
- **Validation:** token names `^[a-z][a-z0-9-]{0,39}$`, at most 80 per mode; values 1–200 plain characters (`[\w\s#%.,()/+*'"-]`), no `url(`, `image(`, `image-set(`, `expression(`, `src(`, `attr(`, `env(`. The admin applies the same rule before setting anything and when reading its local cache. A test checks every preset against it.
- **tweakcn model:** presets override tweakcn's default theme; fonts, radius, shadow geometry, letter spacing and spacing carry from light to dark. Saved themes hold the resolved token sets (44 per mode), so later default changes don't alter a saved theme. Shadows are derived like tweakcn's (`--shadow-2xs` … `--shadow-2xl`), with `color-mix` instead of HSL conversion.
- **CSP:** tokens are set with `style.setProperty` on `<html>`; React's `style` props (swatches) also go through the CSSOM. Checked in Chrome with the built admin under its `_headers` CSP: presets apply, persist across reloads, no CSP violations.
- **Fonts** aren't loaded (no third-party font hosts in the CSP); they apply when installed. A later option: self-host a small set of fonts.
- **Bundle:** presets are a lazy chunk (80 kB, 13.5 kB gzip).
- **Tests:** API tests (defaults, per-user saves, replace semantics, rejected values, cascade), token unit tests (tweakcn export parsing, v3 HSL, derived shadows, all presets valid), 4 component tests, and an e2e test proving the theme follows the account to a fresh browser.
