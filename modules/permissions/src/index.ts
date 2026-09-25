/**
 * `@blixis/permissions` — the permission catalog, roles, and authorization (architecture §30).
 * Modules declare permissions in their definitions; services check them through
 * `AUTHORIZATION_SERVICE` (`@blixis/contracts`).
 *
 * @packageDocumentation
 */

export type { Tenant } from './application/authorization.service.ts'
export {
  type CatalogPermission,
  createPermissionCatalog,
  PERMISSION_CATALOG,
  type PermissionCatalog,
} from './application/catalog.ts'
export { ROLE_SERVICE, type RoleService } from './application/role.service.ts'
export {
  type CreateRoleInput,
  type Role,
  type RoleLevel,
  systemRoles,
  type UpdateRoleInput,
} from './domain/role.ts'
export { permissionsModule } from './module.ts'
export { ROLE_PERMISSIONS } from './permissions.ts'
