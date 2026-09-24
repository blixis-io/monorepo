# 004.002 — Create the apps/api Worker application

## Status

```text
not-started
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
apps/api/worker-configuration.d.ts (generated)
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
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

- [ ] `wrangler dev` serves `GET /api/v1/health` → 200 `{ "status": "ok" }`.
- [ ] `pnpm --filter @blixis/api deploy:dry` succeeds.
- [ ] Changing a var in `wrangler.jsonc` without updating `ApiEnv` fails `pnpm typecheck` (verified once).

## Validation

```bash
pnpm --filter @blixis/api types
pnpm --filter @blixis/api dev   # in another shell: curl -s localhost:8787/api/v1/health
pnpm --filter @blixis/api deploy:dry
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] `compatibility_date` and every flag justified in Technical notes.

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

No technical notes yet.
