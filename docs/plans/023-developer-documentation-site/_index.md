# 023 — Developer Documentation Site

## Status

```text
not-started
```

Milestone: Milestone 1 — Workspace & public contracts  
Roadmap scope: MVP / initial platform  
Progress: 0/4 tasks completed

## Objective

Give module authors (first-party and third-party) one place to learn and look up the Blixis developer API: concepts and guides written by hand, plus an always-current API reference generated from the TSDoc of public packages. The site builds on every PR, deploys from `main`, and is kept up to date as part of the definition of done for public API changes.

## Why this plan exists

The architecture's core promise is that external modules use the same public contracts as first-party ones (§2.2, §25) and that the extension API is proven sufficient (§42 Stage 8, §52). That only works if the contracts are documented where authors look. `@blixis/contracts` is complete (plan 002) and every function, type, and error already has TSDoc, so generating a reference now is cheap and keeps documentation in step with code. Requested by the project owner on 2026-09-24, ahead of plan 003.

## Scope

In scope:

- `apps/docs` Starlight site: structure, navigation, theming, local dev, CI build
- API reference generated from TSDoc of public packages (starting with `@blixis/contracts`)
- developer manual: introduction, module authoring concepts, one page per contract area
- deployment to Cloudflare (Workers static assets) from `main`
- documentation rules in the definition of done

Out of scope:

- HTTP API (REST/GraphQL) consumer documentation — added when those APIs exist (plans 011–012; OpenAPI in 017.001)
- operator runbooks (stay in `docs/operations/`)
- versioned docs per release (revisit after 1.0)

## Dependencies

Depends on:

- [002 — Public Contracts](../002-public-contracts/_index.md)

## Architecture decisions

- **Starlight on Astro** for the site: Markdown/MDX content, built-in search and sidebar, static output that deploys as Workers static assets.
- **TypeDoc for the reference**, run through `starlight-typedoc` + `typedoc-plugin-markdown`. TypeDoc supports TypeScript ≤ 6.0, so `apps/docs` pins its own TypeScript 6 for the generator only (ADR 0018). Library packages remain TypeScript 7; the generator only reads their sources.
- **Generated pages are build output**, not committed, so the reference cannot drift from the code.
- **The manual lives in `apps/docs/src/content/docs/`.** Repository docs (`docs/`) keep architecture, roadmap, conventions, decisions, and operations; `docs/contracts/*` pages point to the site.
- **Definition of done:** a PR that changes a public package's exports updates the manual page and keeps TSDoc complete.

## Deliverables

- `apps/docs` builds with `pnpm --filter @blixis/docs build`; `pnpm --filter @blixis/docs dev` serves it locally.
- API reference for `@blixis/contracts` generated during the build.
- Manual: introduction, "Your first module", and a page per contract area.
- CI builds the site on every PR; `main` deploys it to Cloudflare.
- ADR 0018 accepted.

## Tasks

- [ ] [001 — Scaffold the Starlight documentation site](./001-scaffold-docs-site.md)
- [ ] [002 — Generate the API reference from TSDoc](./002-generate-api-reference.md)
- [ ] [003 — Write the developer manual for module authors](./003-write-developer-manual.md)
- [ ] [004 — Deploy the documentation site to Cloudflare](./004-deploy-docs-to-cloudflare.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] The site is reachable on its Cloudflare URL and shows the manual and the generated `@blixis/contracts` reference.
- [ ] Removing a TSDoc comment or export changes the generated reference in the next build (verified once).

## Risks

- **TypeDoc lag behind TypeScript 7:** if TS 6 cannot parse future sources, the reference build fails. Mitigation: the reference step is isolated; ADR 0018 names the fallback (reference from emitted `.d.ts`, or a TS 7-native generator once available).
- **Astro/Starlight on pnpm 12 and Node 24** — verify builds, `allowBuilds` entries (e.g. `sharp`, `esbuild`).
- **Docs rot** — mitigated by generation and by the definition-of-done rule.

## Open questions

- Custom domain for the docs (e.g. `docs.<domain>`)? Default: `workers.dev` URL until the product domain is decided.

## Technical notes

No technical notes yet.
