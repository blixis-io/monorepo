# Blixis CMS API — Architecture & Agent Guide

> Purpose: implementation guide for Claude Code, Codex, and human contributors.
>
> Namespace: `@blixis/*`
>
> Primary runtime: Cloudflare Workers
>
> Language: TypeScript 7
>
> API framework: Hono
>
> API styles: REST + GraphQL
>
> Primary database: Neon Postgres via Cloudflare Hyperdrive

---

## 1. Goal

Build a modular, extensible headless CMS platform inspired by systems such as Storyblok and Contentful.

The platform must:

- run primarily on Cloudflare Workers;
- use Hono as the HTTP/API framework;
- support both REST and GraphQL;
- use TypeScript 7;
- be modular by design;
- allow first-party modules to live inside the monorepo;
- allow third-party modules to be installed through a package manager;
- use the same module contract for internal and external modules;
- keep business/domain logic independent from REST, GraphQL, Cloudflare, and persistence implementations where practical;
- support asynchronous, event-driven processing;
- use Neon Postgres as the primary relational source of truth;
- access Neon from Workers through Cloudflare Hyperdrive;
- use Cloudflare bindings instead of public HTTP APIs when interacting with Cloudflare platform resources;
- remain suitable for a future extension/plugin marketplace.

The architecture should prefer explicitness and strong typing over framework magic.

---

# 2. Core architecture principles

## 2.1 Domain-first modularity

Organize code by domain/module, not by global technical layer.

Prefer:

```text
modules/
├── content/
├── assets/
├── auth/
├── spaces/
├── users/
└── webhooks/
```

Avoid:

```text
src/
├── controllers/
├── services/
├── repositories/
└── routes/
```

Each module owns the code for its own domain.

---

## 2.2 Internal and external modules use the same contract

A module inside the monorepo:

```text
@blixis/content
```

must be loaded exactly like an external package:

```text
@vendor/blixis-seo
```

The application kernel must not special-case first-party modules.

Example:

```ts
import { createBlixis } from '@blixis/kernel'
import auth from '@blixis/auth'
import content from '@blixis/content'
import assets from '@blixis/assets'
import seo from '@vendor/blixis-seo'

export default createBlixis({
  modules: [
    auth(),
    content(),
    assets(),
    seo(),
  ],
})
```

---

## 2.3 Explicit composition root

Do not scan `node_modules` automatically.

Modules are registered explicitly in application configuration.

Example:

```text
apps/api/src/blixis.config.ts
```

```ts
import auth from '@blixis/auth'
import content from '@blixis/content'
import assets from '@blixis/assets'

export const modules = [
  auth(),
  content(),
  assets(),
]
```

Reasons:

- predictable builds;
- static imports;
- tree-shaking;
- easier Cloudflare Worker bundling;
- explicit dependency graph;
- safer third-party packages;
- better TypeScript inference;
- easier testing;
- easier configuration validation.

---

## 2.4 Business logic is transport-agnostic

REST and GraphQL must not implement business logic independently.

Both call the same domain/application services.

```text
                  ContentService
                 /              \
                /                \
          REST routes        GraphQL resolvers
```

The same service may later be called by:

- REST;
- GraphQL;
- Cloudflare Queue consumers;
- Workflows;
- scheduled Workers;
- CLI tooling;
- internal Service Bindings.

---

## 2.5 Modules communicate through contracts, services, and events

Modules must not import internal implementation files from other modules.

Bad:

```ts
import { ContentRepositoryImpl } from '@blixis/content/src/internal/repository'
```

Good:

```ts
const content = ctx.services.get(CONTENT_SERVICE)
```

Also good:

```ts
await ctx.events.emit('content.published', {
  entryId,
  spaceId,
})
```

Cross-module communication should use:

1. public contracts;
2. service tokens/capabilities;
3. domain/platform events.

---

# 3. Proposed monorepo layout

Use a workspace-based monorepo, preferably pnpm.

```text
blixis/
│
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── blixis.config.ts
│   │   │   └── env.ts
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   │
│   ├── admin/
│   │   └── React + shadcn/ui
│   │
│   └── example-site/
│       └── Astro
│
├── packages/
│   ├── contracts/
│   │   └── package: @blixis/contracts
│   │
│   ├── kernel/
│   │   └── package: @blixis/kernel
│   │
│   ├── database/
│   │   └── package: @blixis/database
│   │
│   ├── events/
│   │   └── package: @blixis/events
│   │
│   ├── graphql/
│   │   └── package: @blixis/graphql
│   │
│   ├── cloudflare/
│   │   └── package: @blixis/cloudflare
│   │
│   ├── sdk/
│   │   └── package: @blixis/sdk
│   │
│   ├── testing/
│   │   └── package: @blixis/testing
│   │
│   └── shared/
│       └── package: @blixis/shared
│
├── modules/
│   ├── auth/
│   │   └── package: @blixis/auth
│   │
│   ├── users/
│   │   └── package: @blixis/users
│   │
│   ├── spaces/
│   │   └── package: @blixis/spaces
│   │
│   ├── content/
│   │   └── package: @blixis/content
│   │
│   ├── assets/
│   │   └── package: @blixis/assets
│   │
│   ├── webhooks/
│   │   └── package: @blixis/webhooks
│   │
│   ├── permissions/
│   │   └── package: @blixis/permissions
│   │
│   └── releases/
│       └── package: @blixis/releases
│
├── tooling/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

---

# 4. Package responsibilities

## `@blixis/contracts`

This package must remain small and stable.

It contains public contracts used by modules.

Allowed:

- TypeScript interfaces;
- public types;
- event definitions;
- service tokens;
- module contracts;
- lifecycle contracts;
- capability definitions;
- permission types;
- public errors;
- shared input/output contracts.

Avoid:

- database clients;
- Hono instances;
- Cloudflare bindings;
- GraphQL server instances;
- concrete service implementations;
- business logic.

This is the primary dependency for external module authors.

---

## `@blixis/kernel`

Responsible for application composition.

Responsibilities:

- module registration;
- module lifecycle;
- dependency validation;
- capability validation;
- service registry;
- event registration;
- REST route mounting;
- GraphQL contribution collection;
- configuration validation;
- startup/bootstrap;
- conflict detection;
- module metadata;
- module ordering when required.

The kernel should not contain CMS domain logic.

---

## `@blixis/database`

Database infrastructure.

Responsibilities:

- Neon/Postgres access;
- Hyperdrive-compatible database connection creation;
- query layer / ORM integration;
- transaction helpers;
- migration infrastructure;
- database health checks;
- common database abstractions.

The database package must not contain content-specific repositories.

Those belong to their modules.

Example:

```text
@blixis/database
    provides DB connection

@blixis/content
    owns ContentRepository

@blixis/users
    owns UserRepository
```

---

## `@blixis/events`

Defines and/or implements the event abstraction.

The rest of the codebase should use:

```ts
await events.emit('content.published', payload)
```

instead of directly depending on Cloudflare Queues.

This package may expose adapters such as:

```text
InProcessEventBus
CloudflareQueueEventBus
CompositeEventBus
```

---

## `@blixis/cloudflare`

Cloudflare-specific adapters and helpers.

Possible responsibilities:

- binding types;
- Queue producer adapters;
- Queue consumer helpers;
- KV adapters;
- R2 adapters;
- Hyperdrive client helpers;
- Workflow adapters;
- Service Binding adapters;
- Cloudflare request context utilities.

Domain packages should depend on abstractions where possible, not directly on this package.

---

## `@blixis/graphql`

GraphQL platform integration.

Recommended responsibilities:

- GraphQL Yoga server setup;
- schema contribution collection;
- resolver composition;
- context creation;
- shared scalars;
- common directives if required;
- error mapping;
- schema validation.

Modules contribute GraphQL schema and resolvers but do not create their own GraphQL server.

---

## `@blixis/sdk`

Public client SDK for consumers.

Potential exports:

```ts
import {
  createBlixisClient,
  createBlixisGraphQLClient,
} from '@blixis/sdk'
```

The SDK should be independent from the admin UI.

---

# 5. Module contract

Use a helper such as `defineModule()`.

Example target API:

```ts
import { defineModule } from '@blixis/kernel'

export default defineModule({
  meta: {
    name: '@blixis/content',
    version: '1.0.0',
  },

  setup(ctx) {
    // register services, capabilities, hooks, etc.
  },

  rest: {
    path: '/content',
    app: contentRoutes,
  },

  graphql: {
    typeDefs,
    resolvers,
  },

  permissions: [
    'content.read',
    'content.write',
    'content.publish',
  ],
})
```

A possible contract:

```ts
export interface BlixisModule<TConfig = unknown> {
  meta: ModuleMeta

  setup?: (
    context: ModuleSetupContext<TConfig>
  ) => void | Promise<void>

  rest?: RestContribution

  graphql?: GraphQLContribution

  permissions?: readonly PermissionDefinition[]

  events?: readonly EventSubscription[]

  migrations?: readonly MigrationDefinition[]
}
```

Metadata:

```ts
export interface ModuleMeta {
  name: string
  version: string

  requires?: Record<string, string>

  capabilities?: readonly string[]

  requiresCapabilities?: readonly string[]
}
```

---

# 6. Module factory API

External module authors should preferably use a factory:

```ts
export default defineModule<SeoConfig>((options) => ({
  meta: {
    name: '@vendor/blixis-seo',
    version: '1.0.0',
  },

  setup(ctx) {
    // ...
  },
}))
```

Consumer:

```ts
import seo from '@vendor/blixis-seo'

seo({
  defaultTitle: 'My website',
})
```

This gives each module typed configuration.

---

# 7. Service registry

Use typed service tokens instead of a string-based service locator.

Example:

```ts
export interface ServiceToken<T> {
  readonly id: symbol
  readonly name: string
}

export function createServiceToken<T>(
  name: string,
): ServiceToken<T> {
  return {
    id: Symbol.for(name),
    name,
  }
}
```

Service contract:

```ts
export interface ContentService {
  findById(id: string): Promise<Entry | null>
  create(input: CreateEntryInput): Promise<Entry>
  publish(id: string): Promise<Entry>
}
```

Token:

```ts
export const CONTENT_SERVICE =
  createServiceToken<ContentService>(
    '@blixis/content.service',
  )
```

Register:

```ts
ctx.services.provide(
  CONTENT_SERVICE,
  contentService,
)
```

Consume:

```ts
const content =
  ctx.services.get(CONTENT_SERVICE)
```

---

# 8. Capabilities

Prefer capabilities when a module only needs a behavior and not a specific package.

Example:

```ts
meta: {
  name: '@vendor/image-ai',

  requiresCapabilities: [
    'blixis.assets',
    'blixis.events',
  ],
}
```

A first-party assets module can provide:

```ts
capabilities: [
  'blixis.assets',
]
```

This prevents unnecessary coupling between package names.

---

# 9. REST architecture

Use Hono.

Modules contribute a Hono sub-application.

Example:

```ts
import { Hono } from 'hono'

const routes = new Hono<BlixisHonoEnv>()

routes.get('/', listEntries)
routes.get('/:id', getEntry)
routes.post('/', createEntry)
routes.patch('/:id', updateEntry)
routes.delete('/:id', deleteEntry)

export default defineModule({
  meta: {
    name: '@blixis/content',
    version: '1.0.0',
  },

  rest: {
    path: '/content',
    app: routes,
  },
})
```

The kernel mounts module routes through Hono:

```ts
for (const module of modules) {
  if (module.rest) {
    app.route(
      module.rest.path,
      module.rest.app,
    )
  }
}
```

Recommended API grouping:

```text
/api/v1/...
```

Possible management routes:

```text
GET    /api/v1/spaces
POST   /api/v1/spaces

GET    /api/v1/spaces/:spaceId/entries
POST   /api/v1/spaces/:spaceId/entries

GET    /api/v1/entries/:id
PATCH  /api/v1/entries/:id
DELETE /api/v1/entries/:id

POST   /api/v1/entries/:id/publish
POST   /api/v1/entries/:id/unpublish

POST   /api/v1/assets
DELETE /api/v1/assets/:id
```

REST is the preferred API for:

- CMS administration;
- CRUD;
- explicit commands;
- publishing;
- asset operations;
- webhooks;
- authentication flows;
- operational endpoints.

---

# 10. GraphQL architecture

Use GraphQL Yoga unless there is a strong project-specific reason to select another GraphQL runtime.

Expose a single platform endpoint:

```text
/graphql
```

Modules contribute schema fragments and resolvers.

Example:

```ts
export const typeDefs = /* GraphQL */ `
  type Entry {
    id: ID!
    name: String!
    slug: String!
  }

  extend type Query {
    entry(id: ID!): Entry
    entries: [Entry!]!
  }
`
```

```ts
export const resolvers = {
  Query: {
    entry: async (_, { id }, ctx) => {
      return ctx.services
        .get(CONTENT_SERVICE)
        .findById(id)
    },
  },
}
```

Module:

```ts
defineModule({
  meta: {
    name: '@blixis/content',
    version: '1.0.0',
  },

  graphql: {
    typeDefs,
    resolvers,
  },
})
```

The kernel/GraphQL package composes all contributions into one schema.

GraphQL is primarily intended for content delivery/query use cases.

Do not duplicate domain logic between REST handlers and GraphQL resolvers.

---

# 11. Cloudflare platform architecture

Blixis is Cloudflare-first.

Use Cloudflare bindings wherever possible.

Target platform components:

```text
Cloudflare Workers
├── Hono API
├── REST
└── GraphQL Yoga

Cloudflare Hyperdrive
└── Neon Postgres

Cloudflare Queues
└── asynchronous domain/platform events

Cloudflare KV
└── read-heavy ephemeral/config/cache use cases

Cloudflare R2
└── binary assets

Cloudflare Workflows
└── durable multi-step background processes

Cloudflare Service Bindings
└── private Worker-to-Worker APIs

Cloudflare Cache
└── public content delivery caching

Optional later:
├── Durable Objects
├── Workers for Platforms
├── Vectorize
└── Analytics Engine
```

---

# 12. Cloudflare Workers

The public API runs on Cloudflare Workers.

Main entry:

```ts
import { createBlixis } from '@blixis/kernel'
import { modules } from './blixis.config'

const app = createBlixis({
  modules,
})

export default app
```

Prefer Web Platform APIs:

- `Request`;
- `Response`;
- `fetch`;
- `URL`;
- `Headers`;
- `crypto`.

Avoid unnecessary Node-only dependencies.

If a dependency requires Node compatibility APIs, verify Cloudflare Workers compatibility before adding it.

---

# 13. Neon + Cloudflare Hyperdrive

Neon Postgres is the relational source of truth.

Cloudflare Hyperdrive sits between Workers and Neon.

Conceptual path:

```text
Cloudflare Worker
       │
       ▼
Cloudflare Hyperdrive
       │
       ▼
Neon Postgres
```

Use Neon/Postgres for durable relational state such as:

- organizations/accounts;
- spaces/projects;
- users;
- memberships;
- roles;
- permissions;
- content types;
- field definitions;
- entries;
- versions;
- locales;
- release state;
- webhook configurations;
- audit records;
- module installation/configuration metadata.

Do not move relational source-of-truth data to KV merely to make the system more Cloudflare-native.

Hyperdrive is the default database access path from Workers.

Keep database creation behind `@blixis/database`.

Example conceptual API:

```ts
const db = createDatabase({
  connectionString: env.HYPERDRIVE.connectionString,
})
```

The exact ORM/query library may be selected independently.

Prefer a solution that:

- supports TypeScript 7;
- works reliably in Cloudflare Workers;
- supports Postgres;
- does not require long-lived Node server state;
- supports migrations;
- supports transactions.

---

# 14. Workers KV

KV is NOT the primary database.

Use Workers KV for read-heavy, globally distributed data where eventual consistency is acceptable.

Suitable examples:

- resolved public configuration;
- feature flags;
- cached permission snapshots where safe;
- cached routing metadata;
- tenant configuration caches;
- content API cache metadata;
- module manifest caches;
- short-lived lookup caches.

Avoid KV for:

- transactions;
- counters requiring strict consistency;
- primary content records;
- canonical user records;
- publishing state;
- financial/billing state;
- anything requiring relational constraints.

Always make the consistency requirements explicit before choosing KV.

---

# 15. Cloudflare Queues

Use Cloudflare Queues for asynchronous event processing.

Domain code should publish through `@blixis/events`, not directly through `env.QUEUE.send()`.

Example:

```ts
await events.emit(
  'content.published',
  {
    entryId,
    spaceId,
    versionId,
  },
)
```

Cloudflare adapter:

```text
EventBus
   │
   ▼
Cloudflare Queue
   │
   ├── webhook delivery
   ├── search indexing
   ├── cache invalidation
   ├── analytics events
   └── integration processing
```

Events should be serializable.

Recommended envelope:

```ts
export interface EventEnvelope<
  TType extends string = string,
  TPayload = unknown,
> {
  id: string
  type: TType
  version: number

  timestamp: string

  tenantId?: string
  spaceId?: string

  payload: TPayload

  metadata?: {
    correlationId?: string
    actorId?: string
    source?: string
  }
}
```

Example event names:

```text
space.created

content-type.created
content-type.updated
content-type.deleted

entry.created
entry.updated
entry.published
entry.unpublished
entry.deleted

asset.created
asset.updated
asset.deleted

user.invited
user.updated

release.created
release.published

webhook.delivery.requested
webhook.delivery.completed
webhook.delivery.failed
```

Events should be versioned when their payload becomes a public integration contract.

---

# 16. Cloudflare Workflows

Use Workflows for durable, multi-step processes that need state, retries, waiting, or orchestration.

Examples:

```text
Publish release
├── validate release
├── publish entries
├── invalidate caches
├── update search index
├── trigger webhooks
└── mark release completed
```

Other candidates:

- bulk import;
- bulk export;
- localization jobs;
- scheduled publishing;
- media processing orchestration;
- content migrations;
- large deletion workflows.

Do not use a Workflow for simple CRUD requests.

---

# 17. Cloudflare R2

Use R2 for binary/object storage.

Examples:

- images;
- videos;
- PDFs;
- documents;
- imports;
- exports;
- generated thumbnails;
- temporary processing artifacts.

Store asset metadata in Postgres.

Example:

```text
Postgres
└── asset record
    ├── id
    ├── filename
    ├── mime type
    ├── size
    ├── metadata
    └── R2 object key

R2
└── binary object
```

Do not make R2 object metadata the canonical CMS asset record.

---

# 18. Service Bindings

When Blixis grows into multiple Workers, use Cloudflare Service Bindings for internal communication.

Example:

```text
Public API Worker
       │
       ├── AUTH service binding
       ├── MEDIA service binding
       └── SEARCH service binding
```

Service Bindings are preferred over public HTTP URLs between Workers in the same Cloudflare platform architecture.

Start as a modular monolith unless splitting Workers solves a real operational or deployment problem.

Do not begin with unnecessary microservices.

---

# 19. Cloudflare bindings

Cloudflare resources should be accessed through bindings.

Example environment shape:

```ts
export interface CloudflareEnv {
  HYPERDRIVE: Hyperdrive

  CACHE_KV: KVNamespace
  CONFIG_KV: KVNamespace

  ASSETS: R2Bucket

  EVENTS: Queue

  // optional later
  // AUTH_SERVICE: Service
  // MEDIA_SERVICE: Service
}
```

Keep bindings isolated behind infrastructure adapters where doing so improves testability.

---

# 20. Data ownership

Each domain module owns its schema/repositories.

Example:

```text
@blixis/content
├── content-type repository
├── entry repository
├── version repository
└── content migrations

@blixis/users
├── user repository
├── membership repository
└── user migrations
```

Avoid a giant central `repositories` package containing every domain repository.

---

# 21. Initial CMS domain model

The first implementation should plan for at least:

```text
Organization
└── Space
    ├── Environment
    ├── Locale
    ├── ContentType
    │   └── FieldDefinition
    │
    ├── Entry
    │   ├── EntryVersion
    │   └── Publication
    │
    ├── Asset
    ├── Release
    ├── Webhook
    └── ModuleConfiguration
```

Identity:

```text
User
└── Membership
    ├── Organization
    ├── Space
    └── Roles / Permissions
```

The exact data model must be refined before production implementation.

---

# 22. Draft versus published content

Do not overwrite the only copy of content during editing.

Support explicit versioning.

Conceptual model:

```text
Entry
├── current draft version
├── current published version
└── version history
```

Publishing should be an explicit command.

```text
POST /api/v1/entries/:id/publish
```

Publishing emits:

```text
entry.published
```

Consumers should be able to request:

- draft content when authorized;
- published content publicly.

---

# 23. Module package structure

Recommended first-party module:

```text
modules/content/
│
├── src/
│   ├── domain/
│   │   ├── entry.ts
│   │   ├── content-type.ts
│   │   └── errors.ts
│   │
│   ├── application/
│   │   ├── content.service.ts
│   │   └── content.commands.ts
│   │
│   ├── infrastructure/
│   │   ├── entry.repository.ts
│   │   └── schema.ts
│   │
│   ├── rest/
│   │   └── routes.ts
│   │
│   ├── graphql/
│   │   ├── schema.ts
│   │   └── resolvers.ts
│   │
│   ├── events/
│   │   └── handlers.ts
│   │
│   ├── permissions.ts
│   └── index.ts
│
├── package.json
└── tsconfig.json
```

Not every module needs every directory.

Do not create empty abstractions just to match a template.

---

# 24. Public module entrypoint

Only export supported public APIs from package root.

Example:

```ts
// modules/content/src/index.ts

export {
  CONTENT_SERVICE,
  type ContentService,
} from './application/content.service'

export {
  type Entry,
  type ContentType,
} from './domain'

export { default } from './module'
```

Do not expose internal repository implementations unless they are intentionally part of the extension API.

Use package `exports` to enforce boundaries.

Example:

```json
{
  "name": "@blixis/content",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  }
}
```

---

# 25. Third-party package rules

A third-party module should primarily depend on:

```json
{
  "peerDependencies": {
    "@blixis/contracts": "^1.0.0"
  }
}
```

Add `@blixis/kernel` as a peer dependency only when the public authoring API requires it.

Avoid bundling duplicate kernel instances.

A plugin must not rely on undocumented internal imports.

Forbidden example:

```ts
import x from '@blixis/kernel/src/internal/registry'
```

---

# 26. Module dependency validation

At bootstrap, validate:

- duplicate module names;
- incompatible module versions;
- missing required packages;
- missing capabilities;
- conflicting route mounts;
- conflicting GraphQL definitions;
- duplicate service providers;
- invalid module configuration.

Fail startup/build clearly when the configuration is invalid.

Error messages must name the offending module.

---

# 27. Module lifecycle

Keep lifecycle intentionally small.

Possible phases:

```text
define
  ↓
validate
  ↓
register
  ↓
boot
  ↓
ready
```

Suggested hooks:

```ts
interface BlixisModule {
  setup?: (ctx: SetupContext) => void | Promise<void>
  boot?: (ctx: BootContext) => void | Promise<void>
}
```

Do not create many lifecycle hooks until actual requirements justify them.

---

# 28. Error model

Define public application errors.

Examples:

```text
ValidationError
NotFoundError
ConflictError
ForbiddenError
UnauthorizedError
RateLimitError
ModuleError
InfrastructureError
```

Transport layers map errors to their own protocol.

Example:

```text
NotFoundError
├── REST    -> HTTP 404
└── GraphQL -> GraphQL error extension code NOT_FOUND
```

Domain/application services should not throw Hono-specific HTTP exceptions.

---

# 29. Validation

Validate all untrusted input at boundaries.

This includes:

- REST request bodies;
- query params;
- route params;
- GraphQL inputs;
- module configuration;
- Queue messages;
- webhook payloads;
- environment configuration.

Select a schema validation library that works cleanly with TypeScript 7 and Cloudflare Workers.

Avoid creating separate, manually duplicated types and validation schemas whenever inference can safely eliminate duplication.

---

# 30. Authentication and authorization

Authentication and authorization are separate concerns.

Authentication answers:

```text
Who is the actor?
```

Authorization answers:

```text
May this actor perform this action?
```

Authorization should be service/domain driven.

Example:

```ts
await permissions.require({
  actor,
  action: 'content.publish',
  resource: entry,
})
```

Avoid embedding role checks everywhere:

```ts
if (user.role === 'admin') {
  // ...
}
```

Prefer permissions/capabilities:

```text
content.read
content.write
content.publish

assets.read
assets.write

users.read
users.invite

spaces.settings.read
spaces.settings.write
```

---

# 31. Multi-tenancy

Assume multi-tenancy early.

Most CMS domain records should belong directly or indirectly to a:

```text
organizationId
spaceId
```

Queries must always be scoped appropriately.

Never trust a resource ID alone without confirming tenant/space ownership.

---

# 32. Event consistency

Database mutation and event publication need an explicit consistency strategy.

Do not silently assume:

```text
DB write succeeds
+
Queue send succeeds
```

is atomic.

For important domain events, consider an outbox pattern.

Conceptually:

```text
Postgres transaction
├── update domain state
└── insert outbox event

Queue dispatcher
├── reads pending outbox rows
├── sends Cloudflare Queue message
└── marks outbox row delivered
```

Use this for events where losing an event would produce incorrect system state.

For non-critical side effects, a simpler strategy may be acceptable.

Document the decision per event class.

---

# 33. Idempotency

Queue consumers and Workflow steps must be designed for retry.

Handlers should be idempotent where possible.

Example:

```text
entry.published event id = evt_123

consumer stores/processes evt_123

retry arrives
→ recognize already processed
→ safely acknowledge
```

Commands such as publish/import may accept an idempotency key.

---

# 34. Caching

Distinguish:

1. database/query optimization;
2. Hyperdrive behavior;
3. Workers Cache API / Cloudflare cache;
4. KV-based lookup caches;
5. client/CDN HTTP caching.

Do not introduce KV caching before measuring a real need.

Published delivery API responses are good cache candidates.

Draft/preview endpoints generally require stricter cache rules.

Cache invalidation should be event-driven where possible.

Example:

```text
entry.published
   ↓
Queue
   ↓
cache invalidation
```

---

# 35. Observability

Every request/event should support a correlation ID.

Recommended structured log fields:

```text
requestId
correlationId
tenantId
spaceId
actorId
module
eventType
eventId
duration
status
```

Never log:

- access tokens;
- passwords;
- secrets;
- raw session cookies;
- full database connection strings;
- sensitive personal data without a justified requirement.

---

# 36. Testing strategy

Use multiple levels.

## Unit tests

Test:

- domain logic;
- services;
- validators;
- permission logic;
- event handlers.

No Cloudflare network required.

---

## Module integration tests

Boot the module using a test kernel.

Example target utility:

```ts
import {
  createTestBlixis,
} from '@blixis/testing'

const app = await createTestBlixis({
  modules: [
    content(),
  ],
})
```

---

## API tests

Test Hono requests directly.

Verify:

- auth;
- validation;
- error mapping;
- REST response formats;
- GraphQL schema behavior.

---

## Infrastructure tests

Test adapters for:

- Neon/Postgres;
- Hyperdrive;
- Queues;
- KV;
- R2.

Keep infrastructure-specific tests separate from domain tests.

---

# 37. TypeScript rules

Target TypeScript 7.

General rules:

- enable strict mode;
- avoid `any`;
- prefer `unknown` at unsafe boundaries;
- validate before narrowing;
- prefer readonly data where useful;
- use explicit exported contracts;
- avoid excessive type-level programming;
- avoid libraries that depend on unsupported/deprecated TypeScript compiler internals;
- keep generated code isolated;
- prefer ESM.

Example baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "Bundler"
  }
}
```

Adjust compiler settings to actual TypeScript 7 requirements and the chosen build tooling.

---

# 38. Dependency rules

Prefer dependencies that:

- support ESM;
- support Cloudflare Workers;
- use Web APIs;
- have good TypeScript support;
- are actively maintained;
- do not assume a persistent Node.js server process.

Before introducing a major dependency, check:

1. Why is it needed?
2. Can a platform primitive solve it?
3. Does it work in Workers?
4. Does it support TypeScript 7?
5. Does it increase bundle size significantly?
6. Is it used in core or only a module?

---

# 39. Security boundaries for external modules

Build-time npm modules execute with the permissions of the Worker bundle.

Therefore third-party modules are trusted code.

Do not market npm-installed modules as sandboxed.

Initial plugin model:

```text
pnpm add package
      ↓
explicit import
      ↓
build
      ↓
Cloudflare deploy
```

Future untrusted/customer-supplied code requires isolation.

Potential future architecture:

```text
Blixis Worker
     │
     ▼
Workers for Platforms
     │
     ├── customer plugin A
     ├── customer plugin B
     └── customer plugin C
```

Do not attempt runtime `node_modules` loading inside the primary Worker.

---

# 40. Plugin roadmap

## Phase 1 — build-time modules

External package:

```bash
pnpm add @vendor/blixis-seo
```

Configuration:

```ts
import seo from '@vendor/blixis-seo'

export const modules = [
  seo(),
]
```

Redeploy required.

This is the initial supported model.

---

## Phase 2 — runtime enable/disable

The package is already bundled, but tenant configuration controls whether it is active.

```text
tenant A -> enabled
tenant B -> disabled
```

Store module configuration in Postgres.

Cache resolved configuration in KV only when useful.

---

## Phase 3 — isolated user plugins

Investigate:

- Workers for Platforms;
- dispatch namespaces;
- capability-based APIs;
- restricted bindings;
- plugin manifests;
- usage limits;
- per-tenant execution;
- versioning and rollback.

Treat this as a separate platform feature.

---

# 41. Suggested first-party modules

Start with:

```text
@blixis/auth
@blixis/users
@blixis/spaces
@blixis/permissions
@blixis/content
@blixis/assets
@blixis/webhooks
```

Later:

```text
@blixis/releases
@blixis/localization
@blixis/search
@blixis/import-export
@blixis/audit
@blixis/analytics
```

Keep the initial module graph small.

---

# 42. Suggested development order

## Stage 1 — kernel

Implement:

- `@blixis/contracts`;
- `@blixis/kernel`;
- `defineModule`;
- module registry;
- typed service registry;
- lifecycle;
- dependency validation;
- Hono route mounting.

No CMS domain logic yet.

---

## Stage 2 — database

Implement:

- `@blixis/database`;
- Hyperdrive binding;
- Neon connection;
- migration setup;
- test database support.

---

## Stage 3 — core domains

Implement:

```text
spaces
users
auth
permissions
```

---

## Stage 4 — content

Implement:

```text
ContentType
FieldDefinition
Entry
EntryVersion
Publishing
```

REST first.

---

## Stage 5 — events

Implement:

- `@blixis/events`;
- in-process adapter for tests;
- Cloudflare Queue adapter;
- versioned event envelopes;
- idempotent consumers.

---

## Stage 6 — GraphQL

Add:

- GraphQL Yoga;
- schema composition;
- content delivery API;
- GraphQL context;
- auth/preview support.

---

## Stage 7 — assets

Add:

- R2;
- asset metadata in Postgres;
- upload flows;
- asset events.

---

## Stage 8 — plugins

Create an example external module outside the monorepo.

For example:

```text
@blixis-example/seo
```

Use it to prove that the public contracts are sufficient.

If the example plugin needs internal imports, the extension API is incomplete.

---

# 43. Example kernel API

Desired developer experience:

```ts
import {
  createBlixis,
} from '@blixis/kernel'

import auth from '@blixis/auth'
import users from '@blixis/users'
import spaces from '@blixis/spaces'
import content from '@blixis/content'
import assets from '@blixis/assets'

const app = createBlixis({
  modules: [
    auth(),
    users(),
    spaces(),
    content(),
    assets(),
  ],
})

export default app
```

The kernel internally performs:

```text
createBlixis
   │
   ├── validate module graph
   ├── create service registry
   ├── create event registry
   ├── run setup hooks
   ├── mount REST applications
   ├── compose GraphQL schema
   ├── register event handlers
   ├── run boot hooks
   └── return Hono application
```

---

# 44. Example external module

Package:

```text
@acme/blixis-seo
```

```ts
import {
  defineModule,
} from '@blixis/kernel'

import {
  CONTENT_SERVICE,
} from '@blixis/content'

export interface SeoOptions {
  defaultTitle?: string
}

export default function seo(
  options: SeoOptions = {},
) {
  return defineModule({
    meta: {
      name: '@acme/blixis-seo',
      version: '1.0.0',

      requiresCapabilities: [
        'blixis.content',
      ],
    },

    setup(ctx) {
      const content =
        ctx.services.get(CONTENT_SERVICE)

      // Register SEO functionality.
    },

    permissions: [
      'seo.read',
      'seo.write',
    ],
  })
}
```

A future improvement is to move shared public content capabilities into `@blixis/contracts` or a dedicated public API package so third-party modules do not require a concrete first-party module package where unnecessary.

---

# 45. API separation

Conceptually separate Management and Delivery APIs even if both initially run in one Worker.

```text
                   Blixis API Worker
                         │
             ┌───────────┴───────────┐
             │                       │
      Management API           Delivery API
             │                       │
          REST                    GraphQL
             │                       │
      admin / commands        content consumers
```

Possible routes:

```text
/api/v1/...
/graphql
```

Later they can become separate Workers without rewriting domain services.

---

# 46. Architecture decision: modular monolith first

Start as a modular monolith.

Do not split every module into its own Worker.

Initial shape:

```text
                one API Worker
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
    content         assets          users
      module          module          module
```

Only extract Workers when there is a concrete reason such as:

- independent deployment;
- separate scaling profile;
- security boundary;
- CPU-intensive workload;
- isolated ownership;
- specialized Cloudflare bindings.

When extracting, prefer Service Bindings.

---

# 47. Non-goals for the first version

Do not build immediately:

- arbitrary runtime package loading;
- untrusted plugin sandboxing;
- microservices per module;
- custom GraphQL engine;
- custom database engine;
- custom queue implementation;
- custom object storage;
- full extension marketplace;
- real-time collaborative editing;
- visual page builder;
- AI features.

Build a strong module/kernel foundation first.

---

# 48. Agent instructions

When modifying this project, Claude Code / Codex must follow these rules.

## Architecture

1. Preserve module boundaries.
2. Do not import another module's internal files.
3. Use public exports only.
4. Keep domain logic outside HTTP and GraphQL handlers.
5. Do not bypass service contracts for convenience.
6. Use events for decoupled asynchronous side effects.
7. Keep Cloudflare implementations behind adapters when practical.
8. Neon/Postgres is the canonical relational source of truth.
9. KV is not a replacement for Postgres.
10. R2 stores binary objects; Postgres stores canonical asset metadata.
11. Use Queues for async processing.
12. Use Workflows for durable multi-step processes.
13. Prefer Service Bindings for private Worker-to-Worker communication.
14. Prefer Cloudflare bindings over Cloudflare REST APIs inside Workers.
15. Start as a modular monolith.

## Code

1. TypeScript 7 only.
2. Strict typing.
3. ESM.
4. Avoid `any`.
5. Validate untrusted input.
6. Avoid hidden global state.
7. Prefer dependency injection through context/services.
8. Do not put business logic in route handlers.
9. Do not put business logic in GraphQL resolvers.
10. Keep functions small and explicit.
11. Add tests for new behavior.
12. Keep public contracts backwards-compatible unless intentionally versioned.

## Packages

1. All first-party packages use the `@blixis/*` namespace.
2. Every module is a package.
3. Internal modules and npm modules implement the same contract.
4. External modules must not use internal package paths.
5. Use `peerDependencies` for shared platform contracts where appropriate.
6. Keep `@blixis/contracts` lightweight.
7. Avoid circular package dependencies.

## Cloudflare

Before using a package, verify it is compatible with Cloudflare Workers.

Prefer:

```text
Workers
Hyperdrive
Queues
KV
R2
Workflows
Cache
Service Bindings
```

over self-hosted equivalents unless there is a documented reason.

---

# 49. Questions an agent must answer before large architectural changes

Before introducing a new subsystem, determine:

1. Which module owns this responsibility?
2. Is this domain logic or infrastructure?
3. Does another module need it?
4. Should communication use a service or an event?
5. Does this need synchronous consistency?
6. Is Neon/Postgres the correct storage?
7. Is KV appropriate given eventual consistency?
8. Is a Queue appropriate?
9. Is a Workflow required?
10. Does it need a separate Worker?
11. Can Service Bindings be used?
12. Is the proposed dependency Workers-compatible?
13. Is the new API part of the stable extension contract?
14. Can a third-party module achieve the same behavior without internal imports?

---

# 50. Architectural summary

The target architecture is:

```text
                           ┌──────────────────────┐
                           │   React Admin UI     │
                           │   shadcn/ui          │
                           └──────────┬───────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ Cloudflare Worker        │
                         │                          │
                         │ Hono                     │
                         │ ├── REST Management API │
                         │ └── GraphQL Yoga        │
                         └────────────┬─────────────┘
                                      │
                              @blixis/kernel
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
       @blixis/content          @blixis/assets         @vendor/plugin
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
                ▼                     ▼                     ▼
          Service Registry         Event Bus          Permissions
                │                     │
                │                     ▼
                │              Cloudflare Queues
                │                     │
                │                consumers /
                │                 Workflows
                │
                ▼
        @blixis/database
                │
                ▼
      Cloudflare Hyperdrive
                │
                ▼
          Neon Postgres


Assets:
Worker → R2

Read-heavy distributed cache/config:
Worker → KV

Internal future services:
Worker → Service Binding → Worker
```

The central architectural rule is:

> Blixis modules own domain behavior. The kernel composes modules. Hono and GraphQL are transport layers. Neon/Postgres owns relational state. Cloudflare bindings provide infrastructure. Queues and events decouple side effects.

---

# 51. Reference documentation

Use current official documentation before implementing platform-specific behavior.

Cloudflare:

- Workers: https://developers.cloudflare.com/workers/
- Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Hyperdrive: https://developers.cloudflare.com/hyperdrive/
- Hyperdrive + Neon: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/
- Queues: https://developers.cloudflare.com/queues/
- Workers KV: https://developers.cloudflare.com/kv/
- R2: https://developers.cloudflare.com/r2/
- Workflows: https://developers.cloudflare.com/workflows/
- Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Workers for Platforms: https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/

Hono:

- Documentation: https://hono.dev/
- Best practices: https://hono.dev/docs/guides/best-practices

GraphQL Yoga:

- Documentation: https://the-guild.dev/graphql/yoga-server

Neon:

- Documentation: https://neon.com/docs

---

# 52. Final implementation constraint

When there is a choice between a fast local workaround and preserving the public module architecture, preserve the architecture.

A feature is not complete if it works only by importing another module's internals.

The system should continuously prove this design by maintaining at least one example third-party module that can be installed as a normal package and uses only public Blixis contracts.
