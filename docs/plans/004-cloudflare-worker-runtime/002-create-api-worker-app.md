# 004.002 — Create the apps/api Worker application

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Create `apps/api` — the Blixis API Worker — with `wrangler.jsonc`, `src/index.ts`, `src/blixis.config.ts` (explicit module list, initially empty or a trivial ping module), and `src/env.ts`, runnable with `wrangler dev`.

## Background

§3 and §12 define `apps/api` with `index.ts`, `blixis.config.ts`, `env.ts`, and `wrangler.jsonc`. §2.3 requires explicit module registration in `blixis.config.ts`. This is the composition root for the whole platform.

## Requirements

- Create `apps/api` as private package `@blixis/api` (not published).
- `wrangler.jsonc`: name, `main: src/index.ts`, pinned `compatibility_date`, flags (none unless needed), `observability` enabled, `vars.BLIXIS_ENV = "local"`.
- `src/env.ts`: `ApiEnv` interface extending `CloudflareEnvBase`; env schema via `defineEnvSchema`; a compile-time assertion that the `wrangler types` generated `Env` is assignable to `ApiEnv` (keeps wrangler config and code in sync).
- `src/blixis.config.ts`: exports `modules` array (§2.3); initially empty.
- `src/index.ts`: builds the app via `createBlixis` and exports the Worker handler (initially `fetch` via the kernel; full adapter in 004.003).
- Scripts: `dev` (`wrangler dev`), `types` (`wrangler types`), `deploy:dry` (`wrangler deploy --dry-run --outdir dist`), `typecheck`, `test`.
- Generated type file committed or generated in CI — decide and document (recommendation: generate in `typecheck` script, commit for reviewability).

## Architectural constraints

- Composition root imports modules only via their package names (§2.3, no relative imports into `modules/`).
- No secrets in `wrangler.jsonc`; use `.dev.vars` (ignored) with a committed `.dev.vars.example`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/package.json
apps/api/tsconfig.json
apps/api/wrangler.jsonc
apps/api/.dev.vars.example
apps/api/src/index.ts
apps/api/src/blixis.config.ts
apps/api/src/env.ts
apps/api/worker-configuration.d.ts (generated, committed)
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
.github/workflows/ci.yml (types:check step)
docs/operations/cloudflare.md
docs/ROADMAP.md
docs/plans/004-cloudflare-worker-runtime/_index.md
```

### Delete

```text
None.
```

## Proposed structure

```text
apps/api/
├── package.json
├── tsconfig.json
├── wrangler.jsonc
├── .dev.vars.example
├── worker-configuration.d.ts
└── src/
    ├── index.ts
    ├── blixis.config.ts
    └── env.ts
```

## Implementation steps

1. Scaffold package and wrangler config (load the `wrangler` skill/docs for current config syntax).
2. Run `wrangler types` and add the assignability check.
3. Write the config, env, and index files.
4. Run `pnpm --filter @blixis/api dev` and request `/api/v1/health`.
5. Run `deploy:dry` and record the bundle size in Technical notes.

## Dependencies

Requires:

- [004.001 — Scaffold @blixis/cloudflare with binding types and env validation](./001-scaffold-cloudflare-package-and-env-typing.md)

## Acceptance criteria

- [x] `wrangler dev` serves `GET /api/v1/health` → 200 `{ "status": "ok" }`.
- [x] `pnpm --filter @blixis/api deploy:dry` succeeds.
- [x] Changing a var in `wrangler.jsonc` without updating `ApiEnv` fails `pnpm typecheck` (verified once).

## Validation

```bash
pnpm --filter @blixis/api types
pnpm --filter @blixis/api dev   # in another shell: curl -s localhost:8787/api/v1/health
pnpm --filter @blixis/api deploy:dry
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] `compatibility_date` and every flag justified in Technical notes.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- `@blixis/api` (private) with `wrangler.jsonc` (Worker `blixis-api`, `main: src/index.ts`, `compatibility_date` **2026-08-15** — kept ≤ the Workers test pool's runtime per ADR 0002, `compatibility_flags: []`, observability on, `upload_source_maps: true`, local vars `BLIXIS_ENV=local`, `LOG_LEVEL=debug`). No `nodejs_compat` yet — nothing needs it; the database driver decision (005.001) may add it.
- `src/index.ts`: `z.config({ jitless: true })` (ADR 0004), `createBlixis({ modules })`, default export `{ fetch }` satisfying `ExportedHandler<Env>`. The full `fetch`/`queue`/`scheduled` adapter comes in 004.003.
- `src/blixis.config.ts`: explicit, empty `modules` list (§2.3). `src/env.ts`: `ApiEnv extends CloudflareEnvBase`, Zod `apiEnvSchema` (applied in 004.004), and a compile-time assertion that wrangler's generated `Env` satisfies `ApiEnv`.
- **Types:** `wrangler types` (Wrangler 4.137, workerd 1.20260921.1 runtime types) generates `worker-configuration.d.ts` (~15.7k lines incl. runtime types) — **committed** for reviewability; Biome ignores it. New `types:check` script (`wrangler types --check`) runs in CI `verify`.
- **Drift guard verified:** removing `BLIXIS_ENV` from `wrangler.jsonc` and regenerating fails typecheck with `TS2344 … 'false' does not satisfy the constraint 'true'` (at `src/env.ts`); restored.
- **TypeScript 7 incremental gotcha found:** the first drift test passed wrongly because TS 7's incremental build info did not re-check `src/env.ts` after the included global `.d.ts` changed; deleting `tsconfig.tsbuildinfo` made the error appear. The `types` script now deletes the app's build info; CI builds from scratch; documented in `docs/operations/cloudflare.md`.
- **Validation:** `wrangler dev` served `GET /api/v1/health` → 200 `{"status":"ok"}` and an unknown route → 404 problem details; `deploy:dry` bundle: **865.88 KiB / 143.38 KiB gzip** (baseline; mostly Zod + Hono).
- The generated `mainModule: typeof import("./src/index")` (extensionless) did not trip `nodenext` resolution in the app tsconfig.
