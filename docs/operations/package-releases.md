# Package releases (npm)

The public packages (`@blixis-io/contracts`, `kernel`, `content-api`, `database`, `events`, `shared`, `testing`, `sdk`) are versioned together and published to npm by the [`release-packages`](../../.github/workflows/release-packages.yml) workflow ([ADR 0020](../decisions/0020-package-scope-and-licence.md), plan 018.005). Platform releases and deploys (`vX.Y.Z`) are separate (plan 021).

## How a release happens

1. Conventional Commits that touch `packages/<name>/` land on `main` (`feat` → minor, `fix` → patch before 1.0; `feat!`/`BREAKING CHANGE:` → minor before 1.0, major after).
2. release-please keeps one PR, **`chore(release): publish packages`**, with the new shared version, `package.json` bumps, and a `CHANGELOG.md` per package.
3. Merging it tags each changed package (`contracts-v0.2.0`, …) and runs the `publish` job: `pnpm build`, `pnpm pack` per package (turns `workspace:`/`catalog:` into versions), `npm publish --provenance --access public`.

Check before merging: the PR's version bump matches the API surface changes (`docs/api-surface`) and the extension-contract job is green.

## One-time setup (owner)

1. **npm organization** `blixis-io` (done 2026-09-28).
2. **Let Actions open the release PR:** Settings → Actions → General → Workflow permissions → tick *Allow GitHub Actions to create and approve pull requests*.
3. **GitHub environment** `npm` (Settings → Environments). Optionally restrict it to `main` and require a reviewer.
4. **First publish** (trusted publishers can only be configured for packages that exist):
   - on npmjs.com create a granular access token with read/write for the `@blixis-io` scope, short expiry;
   - store it as the `NPM_TOKEN` secret of the `npm` environment;
   - merge the first release PR.
5. **Switch to trusted publishing:** for each package on npmjs.com → Settings → Trusted publisher → GitHub Actions: repository `blixis-io/monorepo`, workflow `release-packages.yml`, environment `npm`. Then delete the `NPM_TOKEN` secret and revoke the token; the workflow uses OIDC when the secret is empty.
6. Optionally, on npmjs.com require 2FA and disallow tokens for publishing once trusted publishing works.

## Checks that protect releases

- `published-dependency` (`pnpm lint`): published packages don't depend on unpublished ones and take shared Blixis packages, Drizzle, and Hono as peers.
- `pnpm api-surface:check` (verify): public API changes are reviewed.
- `extension contract` (CI): the example plugin installs from packed tarballs, passes its tests, and bundles into a Worker.
- Local dry run: `pnpm --filter @blixis-io/<name> publish --dry-run --no-git-checks`.
