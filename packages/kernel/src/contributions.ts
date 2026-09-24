import {
  type BlixisModule,
  createServiceToken,
  type EventSubscription,
  type GraphQLContribution,
  isPermissionId,
  type MigrationDefinition,
  type PermissionDefinition,
} from '@blixis/contracts'
import type { ModuleProblem } from './errors.ts'

/** A contribution together with the module that made it. */
export interface Attributed<T> {
  readonly module: string
  readonly value: T
}

/**
 * Everything modules contributed besides REST routes, collected and checked at startup
 * (architecture §43). Consumed by platform packages: permissions (plan 009), events (006),
 * GraphQL (012), and the migration runner (005).
 */
export interface KernelContributions {
  readonly permissions: readonly Attributed<PermissionDefinition>[]
  readonly subscriptions: readonly Attributed<EventSubscription>[]
  readonly graphql: readonly Attributed<GraphQLContribution>[]
  /** In module bootstrap order, then declaration order. */
  readonly migrations: readonly Attributed<MigrationDefinition>[]
}

/** Service token for the collected {@link KernelContributions} (app scope). */
export const KERNEL_CONTRIBUTIONS = createServiceToken<KernelContributions>(
  '@blixis/kernel.contributions',
)

const MIGRATION_ID = /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*$/

/**
 * Collects contributions from modules in bootstrap order and reports conflicts:
 * invalid or duplicate permission ids, permission namespaces claimed by two modules,
 * duplicate subscription ids within a module, and invalid or duplicate migration ids.
 */
export function collectContributions(modules: readonly BlixisModule[]): {
  readonly contributions: KernelContributions
  readonly problems: readonly ModuleProblem[]
} {
  const problems: ModuleProblem[] = []
  const permissions: Attributed<PermissionDefinition>[] = []
  const subscriptions: Attributed<EventSubscription>[] = []
  const graphql: Attributed<GraphQLContribution>[] = []
  const migrations: Attributed<MigrationDefinition>[] = []
  const permissionOwner = new Map<string, string>()
  const namespaceOwner = new Map<string, string>()

  for (const module of modules) {
    const name = module.meta.name

    for (const permission of module.permissions ?? []) {
      if (!isPermissionId(permission.id)) {
        problems.push({
          module: name,
          message: `declares an invalid permission id "${permission.id}"`,
        })
        continue
      }
      const existing = permissionOwner.get(permission.id)
      if (existing !== undefined) {
        problems.push({
          module: name,
          message:
            existing === name
              ? `declares permission ${permission.id} twice`
              : `declares permission ${permission.id}, already declared by ${existing}`,
        })
        continue
      }
      const namespace = permission.id.split('.')[0] ?? ''
      const nsOwner = namespaceOwner.get(namespace)
      if (nsOwner !== undefined && nsOwner !== name) {
        problems.push({
          module: name,
          message: `permission namespace "${namespace}" is owned by ${nsOwner} (${permission.id})`,
        })
        continue
      }
      namespaceOwner.set(namespace, name)
      permissionOwner.set(permission.id, name)
      permissions.push({ module: name, value: permission })
    }

    const subscriptionIds = new Set<string>()
    for (const subscription of module.events ?? []) {
      if (subscriptionIds.has(subscription.id)) {
        problems.push({
          module: name,
          message: `declares event subscription id "${subscription.id}" twice`,
        })
        continue
      }
      subscriptionIds.add(subscription.id)
      subscriptions.push({ module: name, value: subscription })
    }

    if (module.graphql !== undefined) graphql.push({ module: name, value: module.graphql })

    const migrationIds = new Set<string>()
    for (const migration of module.migrations ?? []) {
      if (!MIGRATION_ID.test(migration.id)) {
        problems.push({
          module: name,
          message: `has an invalid migration id "${migration.id}" (expected NNNN_snake_case)`,
        })
        continue
      }
      if (migrationIds.has(migration.id)) {
        problems.push({ module: name, message: `declares migration ${migration.id} twice` })
        continue
      }
      migrationIds.add(migration.id)
      migrations.push({ module: name, value: migration })
    }
  }

  return {
    contributions: Object.freeze({
      permissions: Object.freeze(permissions),
      subscriptions: Object.freeze(subscriptions),
      graphql: Object.freeze(graphql),
      migrations: Object.freeze(migrations),
    }),
    problems,
  }
}
