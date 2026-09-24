/**
 * `@blixis/contracts` — the small, stable public surface every Blixis module builds against.
 *
 * Contains types, service tokens, and small pure helpers only: no database clients, Hono
 * instances, Cloudflare bindings, GraphQL servers, or business logic (architecture §4).
 *
 * @packageDocumentation
 */
export * from './capabilities.ts'
export * from './context.ts'
export * from './errors.ts'
export * from './events.ts'
export * from './migrations.ts'
export * from './module.ts'
export * from './permissions.ts'
export * from './services.ts'
export * from './validation.ts'
