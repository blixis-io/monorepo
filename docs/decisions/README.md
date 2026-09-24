# Architecture Decision Records

Decisions that [`BLIXIS_ARCHITECTURE.md`](../BLIXIS_ARCHITECTURE.md) leaves open are recorded here as ADRs. Each ADR is written by the roadmap task that owns the decision (see the decision register in [ROADMAP.md](../ROADMAP.md#open-architectural-decisions)).

## Format

File name: `NNNN-short-kebab-title.md`, numbered sequentially (`0001`, `0002`, …). Numbers are never reused.

```markdown
# NNNN — Title

- Status: proposed | accepted | superseded by NNNN | deprecated
- Date: YYYY-MM-DD
- Roadmap task: PPP.TTT

## Context
What problem, which constraints, what evidence (spike results, measurements, versions).

## Decision
What we do — concrete enough to implement without re-deciding.

## Alternatives considered
One line per rejected option with the reason.

## Consequences
What becomes easier or harder; follow-up tasks; risks.
```

## Rules

- ADRs are immutable once accepted. To change a decision, write a new ADR that supersedes the old one and update the old one's status line only.
- Record tool versions that were verified; they are evidence, not pins (pins live in the catalog / `package.json`).
- Link the ADR from the owning task's Technical notes and from the ROADMAP decision register.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-typescript-7-build-strategy.md) | TypeScript 7 compile and emit strategy | accepted |
| [0002](./0002-test-runner.md) | Test runner | accepted |
| [0003](./0003-lint-format-and-boundaries.md) | Lint, format, and package-boundary checks | accepted |
