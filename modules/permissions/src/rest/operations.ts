import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { z } from 'zod'
import { createRoleSchema, type Role, updateRoleSchema } from '../domain/role.ts'

const permissionId = z
  .templateLiteral([z.string(), '.', z.string()])
  .describe('e.g. `content.entries.publish`')

export const roleSchema = z
  .object({
    id: z
      .string()
      .describe('System role key (`owner`, `admin`, `editor`, `viewer`) or custom role id'),
    organizationId: z.string().nullable().describe('`null` for system roles'),
    name: z.string(),
    description: z.string(),
    permissions: z.array(permissionId),
    system: z.boolean(),
    assignableTo: z.array(z.enum(['organization', 'space'])),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .meta({ id: 'Role', description: 'A system or custom role: a set of permissions' })

const check: SameShape<z.output<typeof roleSchema>, Role> = true
void check

export const permissionCatalogSchema = z
  .object({
    modules: z.array(
      z.object({
        module: z.string(),
        permissions: z.array(
          z.object({
            id: z.string(),
            description: z.string(),
            scope: z.string(),
            defaultRoles: z.array(z.string()),
            deliveryKeys: z.array(z.string()),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'PermissionCatalog', description: 'Every permission, grouped by module' })

/** Operations of `@blixis/permissions` (ADR 0015). */
export const PERMISSIONS_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/permissions',
    id: 'listPermissions',
    tag: 'Roles',
    summary: 'The permission catalog, for role editors',
    responses: { 200: { description: 'OK', schema: permissionCatalogSchema } },
  },
  {
    method: 'GET',
    path: '/organizations/:orgId/roles',
    id: 'listRoles',
    tag: 'Roles',
    summary: 'System and custom roles of an organization',
    permission: 'roles.read',
    responses: { 200: { description: 'OK', schema: z.object({ roles: z.array(roleSchema) }) } },
  },
  {
    method: 'POST',
    path: '/organizations/:orgId/roles',
    id: 'createRole',
    tag: 'Roles',
    summary: 'Create a custom role (only with permissions you hold)',
    permission: 'roles.manage',
    request: { body: createRoleSchema },
    responses: { 201: { description: 'Created', schema: roleSchema } },
  },
  {
    method: 'PATCH',
    path: '/organizations/:orgId/roles/:roleId',
    id: 'updateRole',
    tag: 'Roles',
    summary: 'Change a custom role',
    permission: 'roles.manage',
    request: { body: updateRoleSchema },
    responses: { 200: { description: 'OK', schema: roleSchema } },
  },
  {
    method: 'DELETE',
    path: '/organizations/:orgId/roles/:roleId',
    id: 'deleteRole',
    tag: 'Roles',
    summary: 'Delete an unassigned custom role',
    permission: 'roles.manage',
    responses: { 204: { description: 'Deleted' } },
  },
]
