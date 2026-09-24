# 019 — Admin UI Foundation

## Status

```text
not-started
```

Milestone: Milestone 8 — Consumers & extension platform  
Roadmap scope: MVP / initial platform  
Progress: 0/4 tasks completed

## Objective

Deliver a usable, deployable admin application where editors can sign in, choose an organization and space, model content types, and create/edit/publish entries (with asset picking once available), using only the public Management API — proving the API is sufficient for a real editorial client.

## Why this plan exists

§3 lists `apps/admin` (React + shadcn/ui) and §50 places the React Admin UI at the top of the target architecture as a client of the Worker API. §4 keeps the SDK independent of the admin, so the admin consumes the SDK — not server packages. A thin but real admin is also the fastest way to find API ergonomics problems before 1.0.

## Scope

In scope:

- ADR for admin stack (bundler, router, data fetching, forms) and hosting (Workers static assets vs. Pages; same-site cookies)
- app shell, auth screens, org/space switching
- content type editor (fields, validations)
- entry list and editor (draft save, publish/unpublish, versions, restore)
- asset picker/upload in entry editor (using assets API)
- accessibility and i18n readiness baseline

Out of scope:

- visual page builder, real-time collaboration, AI features (§47 non-goals)
- roles/webhooks/API keys management screens (deferred; available via API) — add if time allows in follow-up plans
- full asset library management beyond picker/upload (deferred)

## Dependencies

Depends on:

- [017 — SDK & Example Astro Consumer](../017-sdk-and-example-consumer/_index.md)

## Architecture decisions

- **Admin is an API client** (§50): no imports from `modules/*` or server packages; data through `@blixis/sdk` management client.
- **Cookie sessions** (007) require same-site deployment or a documented CORS/credentials setup; ADR 0017 decides hosting to keep `SameSite=Lax` cookies working (recommendation: serve admin from the same Worker via static assets under `/admin`, or a sibling subdomain with shared parent domain).
- **UI stack**: React + shadcn/ui (§3); rest of stack chosen in ADR 0017.
- **DOM types** only in the admin tsconfig (001.003 base excludes DOM).

## Deliverables

- ADR 0017 accepted.
- `apps/admin` builds, is lint/typecheck/test clean, and deploys with the API.
- Editorial flow: sign in → space → content type → entry → publish works in a browser (verified manually and with Playwright smoke test).

## Tasks

- [ ] [001 — Decide the admin stack and scaffold apps/admin](./001-admin-stack-and-scaffold.md)
- [ ] [002 — Implement admin authentication and navigation shell](./002-admin-auth-and-shell.md)
- [ ] [003 — Implement the content type editor](./003-content-type-editor.md)
- [ ] [004 — Implement the entry list and editor with publishing](./004-entry-editor-and-publishing.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Playwright smoke test of the editorial flow passes in CI against a local API.
- [ ] No imports from server packages (boundary check).

## Risks

- **Scope creep**: admin UIs grow indefinitely; stick to the editorial minimum.
- **Cookie/CORS complexity** across origins.
- **Field editor complexity** for rich text; use a proven editor aligned with ADR 0010 format.

## Open questions

- Hosting: same Worker (static assets) vs. separate Worker/Pages project on a subdomain? (ADR 0017.)
- Rich text editor library consistent with ADR 0010 format (e.g. Tiptap/ProseMirror)? Decide in 019.004.
- Is admin localisation (UI language) required for MVP? Default: English only, i18n-ready string handling.

## Technical notes

No technical notes yet.
