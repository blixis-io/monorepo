import {
  createServiceToken,
  ModuleError,
  type PermissionDefinition,
  type PermissionId,
  type ServiceToken,
  type SystemRoleKey,
} from '@blixis/contracts'
import type { Attributed } from '@blixis/kernel'

/** A registered permission with the module that declared it. */
export interface CatalogPermission {
  readonly id: PermissionId
  readonly description: string
  /** Tenant level at which the permission is granted (`space` unless declared otherwise). */
  readonly scope: 'organization' | 'space'
  /** System roles granted this permission by default (`owner` holds every permission). */
  readonly defaultRoles: readonly SystemRoleKey[]
  /** Name of the declaring module, e.g. `@blixis/spaces`. */
  readonly module: string
}

/**
 * Every permission the running modules declared (architecture §5, §30), collected by the kernel
 * at startup. App-scoped and immutable: `services.get(PERMISSION_CATALOG)`.
 */
export interface PermissionCatalog {
  /** All permissions, in module bootstrap order, then declaration order. */
  list(): readonly CatalogPermission[]
  /** A permission by id, or `undefined` if no module declares it. */
  get(id: string): CatalogPermission | undefined
  /**
   * Returns the permission, or throws: an unknown permission id in code is a programming error
   * (a typo, or a module missing from the app), never a silent deny.
   * @throws ModuleError
   */
  assertKnown(id: string): CatalogPermission
}

/** App-scoped {@link PermissionCatalog}, provided by `permissionsModule()`. */
export const PERMISSION_CATALOG: ServiceToken<PermissionCatalog> =
  createServiceToken<PermissionCatalog>('@blixis/permissions.catalog')

/** Builds the catalog from the kernel's collected permission contributions. */
export function createPermissionCatalog(
  permissions: readonly Attributed<PermissionDefinition>[],
): PermissionCatalog {
  const all: readonly CatalogPermission[] = Object.freeze(
    permissions.map(({ module, value }) =>
      Object.freeze({
        id: value.id,
        description: value.description,
        scope: value.scope ?? 'space',
        defaultRoles: value.defaultRoles ?? [],
        module,
      }),
    ),
  )
  const byId = new Map(all.map((permission) => [permission.id as string, permission]))
  return {
    list: () => all,
    get: (id) => byId.get(id),
    assertKnown(id) {
      const permission = byId.get(id)
      if (permission === undefined) {
        throw new ModuleError(
          '@blixis/permissions',
          `Unknown permission "${id}": no registered module declares it`,
        )
      }
      return permission
    },
  }
}
