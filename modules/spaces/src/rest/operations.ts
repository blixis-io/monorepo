import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { z } from 'zod'
import type { Member } from '../application/members.service.ts'
import type { SpaceDetails } from '../application/tenancy.service.ts'
import type { Environment, Locale, Organization, Space } from '../domain/tenancy.ts'

const timestamp = z.string().describe('ISO 8601, UTC')

export const organizationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'Organization', description: 'A top-level tenant: owns spaces and members' })

export const spaceSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    slug: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'Space', description: 'A content space inside an organization' })

export const environmentSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    spaceId: z.string(),
    key: z.string(),
    isDefault: z.boolean(),
    createdAt: timestamp,
  })
  .meta({ id: 'Environment', description: 'A content environment of a space (MVP: `main`)' })

export const localeSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    spaceId: z.string(),
    code: z.string().describe('BCP 47, e.g. `nl-NL`'),
    name: z.string(),
    isDefault: z.boolean(),
    fallbackCode: z.string().nullable(),
    createdAt: timestamp,
  })
  .meta({ id: 'Locale', description: 'A locale of a space, with an optional fallback' })

export const spaceDetailsSchema = spaceSchema
  .extend({ environments: z.array(environmentSchema), locales: z.array(localeSchema) })
  .meta({ id: 'SpaceDetails', description: 'A space with its environments and locales' })

export const memberSchema = z
  .object({
    id: z.string().describe('Membership id'),
    userId: z.string(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
    role: z
      .string()
      .describe('A system role key (`owner`, `admin`, `editor`, `viewer`) or a custom role id'),
    createdAt: timestamp,
  })
  .meta({ id: 'Member', description: 'A member of an organization or a space' })

// Compile-time drift checks against the service types.
const checks: [
  SameShape<z.output<typeof organizationSchema>, Organization>,
  SameShape<z.output<typeof spaceSchema>, Space>,
  SameShape<z.output<typeof environmentSchema>, Environment>,
  SameShape<z.output<typeof localeSchema>, Locale>,
  SameShape<z.output<typeof spaceDetailsSchema>, SpaceDetails>,
  SameShape<z.output<typeof memberSchema>, Member>,
] = [true, true, true, true, true, true]
void checks

const nameSlug = z.object({
  name: z.string().max(100),
  slug: z.string().describe('Lower-case letters, digits, hyphens (1–63)'),
})
const addMember = z.object({ email: z.string(), role: z.string() })
const role = z.object({ role: z.string() })
const localeInput = z.object({
  code: z.string(),
  name: z.string().optional(),
  fallbackCode: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
})

const ok = <T extends z.ZodType>(schema: T, description = 'OK') => ({
  200: { description, schema },
})
const created = <T extends z.ZodType>(schema: T) => ({ 201: { description: 'Created', schema } })
const deleted = { 204: { description: 'Deleted' } }

/** Operations of `@blixis/spaces` (ADR 0015). */
export const SPACES_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/organizations',
    id: 'listOrganizations',
    tag: 'Organizations',
    summary: 'List your organizations',
    responses: ok(z.object({ organizations: z.array(organizationSchema) })),
  },
  {
    method: 'POST',
    path: '/organizations',
    id: 'createOrganization',
    tag: 'Organizations',
    summary: 'Create an organization (you become its owner)',
    request: { body: nameSlug },
    responses: created(organizationSchema),
  },
  {
    method: 'GET',
    path: '/organizations/:orgId',
    id: 'getOrganization',
    tag: 'Organizations',
    summary: 'Get an organization',
    permission: 'organizations.read',
    responses: ok(organizationSchema),
  },
  {
    method: 'PATCH',
    path: '/organizations/:orgId',
    id: 'updateOrganization',
    tag: 'Organizations',
    summary: 'Rename an organization or change its slug',
    permission: 'organizations.settings.write',
    request: { body: nameSlug.partial() },
    responses: ok(organizationSchema),
  },
  {
    method: 'GET',
    path: '/organizations/:orgId/spaces',
    id: 'listSpaces',
    tag: 'Spaces',
    summary: 'List the spaces of an organization you can see',
    permission: 'organizations.read',
    responses: ok(z.object({ spaces: z.array(spaceSchema) })),
  },
  {
    method: 'POST',
    path: '/organizations/:orgId/spaces',
    id: 'createSpace',
    tag: 'Spaces',
    summary: 'Create a space with its default environment and locale',
    permission: 'spaces.create',
    request: {
      body: nameSlug.extend({ defaultLocale: z.string().optional().describe('Default `en-US`') }),
    },
    responses: created(spaceDetailsSchema),
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId',
    id: 'getSpace',
    tag: 'Spaces',
    summary: 'Get a space with its environments and locales',
    permission: 'spaces.read',
    responses: ok(spaceDetailsSchema),
  },
  {
    method: 'PATCH',
    path: '/spaces/:spaceId',
    id: 'updateSpace',
    tag: 'Spaces',
    summary: 'Rename a space or change its slug',
    permission: 'spaces.settings.write',
    request: { body: nameSlug.partial() },
    responses: ok(spaceSchema),
  },
  {
    method: 'DELETE',
    path: '/spaces/:spaceId',
    id: 'deleteSpace',
    tag: 'Spaces',
    summary: 'Delete a space and everything in it',
    permission: 'spaces.delete',
    responses: deleted,
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/environments',
    id: 'listEnvironments',
    tag: 'Spaces',
    summary: 'List environments',
    permission: 'spaces.read',
    responses: ok(z.object({ environments: z.array(environmentSchema) })),
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/locales',
    id: 'listLocales',
    tag: 'Locales',
    summary: 'List locales',
    permission: 'spaces.read',
    responses: ok(z.object({ locales: z.array(localeSchema) })),
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/locales',
    id: 'createLocale',
    tag: 'Locales',
    summary: 'Add a locale',
    permission: 'spaces.settings.write',
    request: { body: localeInput },
    responses: created(localeSchema),
  },
  {
    method: 'PATCH',
    path: '/spaces/:spaceId/locales/:localeId',
    id: 'updateLocale',
    tag: 'Locales',
    summary: 'Change a locale’s name, fallback, or default',
    permission: 'spaces.settings.write',
    request: { body: localeInput.omit({ code: true }) },
    responses: ok(localeSchema),
  },
  {
    method: 'DELETE',
    path: '/spaces/:spaceId/locales/:localeId',
    id: 'deleteLocale',
    tag: 'Locales',
    summary: 'Delete a locale (not the default)',
    permission: 'spaces.settings.write',
    responses: deleted,
  },
  {
    method: 'GET',
    path: '/organizations/:orgId/members',
    id: 'listOrganizationMembers',
    tag: 'Members',
    summary: 'List organization members',
    permission: 'organizations.read',
    responses: ok(z.object({ members: z.array(memberSchema) })),
  },
  {
    method: 'POST',
    path: '/organizations/:orgId/members',
    id: 'addOrganizationMember',
    tag: 'Members',
    summary: 'Add an existing user to the organization',
    permission: 'organizations.members.manage',
    request: { body: addMember },
    responses: created(memberSchema),
  },
  {
    method: 'PATCH',
    path: '/organizations/:orgId/members/:membershipId',
    id: 'changeOrganizationMemberRole',
    tag: 'Members',
    summary: 'Change an organization member’s role',
    permission: 'organizations.members.manage',
    request: { body: role },
    responses: ok(memberSchema),
  },
  {
    method: 'DELETE',
    path: '/organizations/:orgId/members/:membershipId',
    id: 'removeOrganizationMember',
    tag: 'Members',
    summary: 'Remove an organization member',
    permission: 'organizations.members.manage',
    responses: deleted,
  },
  {
    method: 'GET',
    path: '/spaces/:spaceId/members',
    id: 'listSpaceMembers',
    tag: 'Members',
    summary: 'List space members',
    permission: 'spaces.read',
    responses: ok(z.object({ members: z.array(memberSchema) })),
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/members',
    id: 'addSpaceMember',
    tag: 'Members',
    summary: 'Add an existing user to the space',
    permission: 'spaces.members.manage',
    request: { body: addMember },
    responses: created(memberSchema),
  },
  {
    method: 'PATCH',
    path: '/spaces/:spaceId/members/:membershipId',
    id: 'changeSpaceMemberRole',
    tag: 'Members',
    summary: 'Change a space member’s role',
    permission: 'spaces.members.manage',
    request: { body: role },
    responses: ok(memberSchema),
  },
  {
    method: 'DELETE',
    path: '/spaces/:spaceId/members/:membershipId',
    id: 'removeSpaceMember',
    tag: 'Members',
    summary: 'Remove a space member',
    permission: 'spaces.members.manage',
    responses: deleted,
  },
]
