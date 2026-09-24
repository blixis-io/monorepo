# 005.001 — Select the Postgres driver, query layer, and migration tooling

## Status

```text
not-started
```

## Parent plan

[005 — Database Foundation](./_index.md)

## Objective

Decide — through a short spike on Workers with Hyperdrive — which Postgres driver, query builder/ORM, and migration tooling Blixis uses, and record the decision as ADR 0006.

## Background

§13 leaves the ORM/query library open but lists hard criteria. The choice affects every repository in every module and the migration contract, so it is made once with evidence. Typical candidates: drivers `pg` (node-postgres) and `postgres` (postgres.js) — both documented by Cloudflare for Hyperdrive; query layers Drizzle ORM and Kysely; migrations via the query layer's tooling or plain SQL files with a small custom runner.

## Requirements

- Spike (outside the repo or in a throwaway branch) a Worker that connects via a Hyperdrive local connection string to Postgres, runs a transaction with two statements, and a typed query — for each candidate combination shortlisted.
- Evaluate: Workers compatibility and required flags, bundle size impact, TS7 type-check time and correctness, transaction API ergonomics, support for module-owned schemas, migration tooling that can run from Node against direct Neon URL, generated SQL readability, JSON/JSONB support (content storage in plan 010), maintenance activity.
- Decide migration format: SQL files per module (portable, reviewable) vs. query-builder migrations; the `MigrationDefinition` contract (002.008) must support the decision.
- Write ADR 0006 with the decision, versions, rejected options, and required `compatibility_flags`.

## Architectural constraints

- Must work on Workers through Hyperdrive with no long-lived Node process (§13).
- Must not require the TypeScript JS compiler API at build time (§37).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0006-database-stack.md
```

### Modify

```text
None.
```

### Delete

```text
None.
```

## Implementation steps

1. Read current Cloudflare Hyperdrive + Neon docs (links in §51).
2. Build spikes for the shortlisted combinations.
3. Measure bundle size and type-check time.
4. Write ADR 0006.

## Dependencies

Requires:

- [004.006 — Configure wrangler environments and deploy dry-run in CI](../004-cloudflare-worker-runtime/006-environments-and-deploy-dry-run.md)

## Acceptance criteria

- [ ] ADR 0006 accepted, naming driver, query layer, migration format, and compatibility flags.
- [ ] Spike evidence (numbers) included in the ADR.

## Validation

- Review ADR against §13 criteria; confirm each criterion has an explicit answer.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Decision does not leak the query library into `@blixis/contracts`.

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
