/**
 * `@blixis/permissions` — the permission catalog, roles, and authorization (architecture §30).
 * Modules declare permissions in their definitions; services check them through
 * `AUTHORIZATION_SERVICE` (`@blixis/contracts`).
 *
 * @packageDocumentation
 */
export {
  type CatalogPermission,
  createPermissionCatalog,
  PERMISSION_CATALOG,
  type PermissionCatalog,
} from './application/catalog.ts'
export { permissionsModule } from './module.ts'
export { ROLE_PERMISSIONS } from './permissions.ts'
