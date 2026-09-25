import { ForbiddenError, type ModuleHonoEnv, NotFoundError, validate } from '@blixis/contracts'
import {
  MEMBERSHIP_SERVICE,
  type Membership,
  type MembershipScope,
  organizationRoleSchema,
  spaceRoleSchema,
  USER_SERVICE,
} from '@blixis/users'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  actingUserId,
  canManageSpace,
  requireOrganizationManager,
  requireOrganizationMember,
  requireSpaceAccess,
} from '../application/access.ts'
import { TENANCY_SERVICE } from '../application/tenancy.service.ts'

type Ctx = Context<ModuleHonoEnv>
const userOf = (c: Ctx) => actingUserId(c.var.requestContext.actor)
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as unknown

const addMemberInput = (role: z.ZodType) =>
  z.object({ email: z.string().trim().toLowerCase().max(254), role })

/** Members with their user's email and display name (for management UIs). */
async function present(c: Ctx, list: readonly Membership[]) {
  const users = c.var.services.get(USER_SERVICE)
  return Promise.all(
    list.map(async (m) => {
      const user = await users.findById(m.userId)
      return {
        id: m.id,
        userId: m.userId,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        role: m.role,
        createdAt: m.createdAt,
      }
    }),
  )
}

/** Adds an existing user by email; unknown emails get guidance (invitations are deferred). */
async function addByEmail(c: Ctx, scope: MembershipScope, email: string, role: string) {
  const user = await c.var.services.get(USER_SERVICE).findByEmail(email)
  if (user === undefined) {
    throw new NotFoundError(
      'No user with this email. Invitations are not available yet: create the account first (pnpm auth:create-user).',
    )
  }
  const memberships = c.var.services.get(MEMBERSHIP_SERVICE)
  const created =
    scope.spaceId === undefined
      ? await memberships.addOrganizationMember({
          userId: user.id,
          organizationId: scope.organizationId,
          role: role as never,
        })
      : await memberships.addSpaceMember({
          userId: user.id,
          organizationId: scope.organizationId,
          spaceId: scope.spaceId,
          role: role as never,
        })
  return (await present(c, [created]))[0]
}

/**
 * Only organization owners may grant or revoke `owner` (until permissions arrive in 009.004).
 * TODO(009.004): replace with permission checks.
 */
async function assertOwnerChange(
  c: Ctx,
  organizationId: string,
  roles: readonly (string | undefined)[],
) {
  if (!roles.includes('owner')) return
  const own = await requireOrganizationMember(
    c.var.services.get(MEMBERSHIP_SERVICE),
    userOf(c),
    organizationId,
  )
  if (own !== 'owner') throw new ForbiddenError('Only owners can grant or revoke the owner role')
}

/** `/api/v1/organizations/*` and `/api/v1/spaces/*`. Handlers only translate HTTP ⇄ services. */
export function spacesRoutes(options: { readonly allowOrganizationCreation: boolean }) {
  return (
    new Hono<ModuleHonoEnv>()
      .get('/organizations', async (c) =>
        c.json({
          organizations: await c.var.services.get(TENANCY_SERVICE).listOrganizations(userOf(c)),
        }),
      )
      .post('/organizations', async (c) => {
        const userId = userOf(c)
        if (!options.allowOrganizationCreation)
          throw new ForbiddenError('Organization creation is disabled')
        const body = (await json(c)) as { name?: string; slug?: string }
        return c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .createOrganization(userId, { name: body.name ?? '', slug: body.slug ?? '' }),
          201,
        )
      })
      .get('/organizations/:orgId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .getOrganization(userOf(c), c.req.param('orgId')),
        ),
      )
      .patch('/organizations/:orgId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .renameOrganization(
              userOf(c),
              c.req.param('orgId'),
              (await json(c)) as { name?: string; slug?: string },
            ),
        ),
      )
      .get('/organizations/:orgId/spaces', async (c) =>
        c.json({
          spaces: await c.var.services
            .get(TENANCY_SERVICE)
            .listSpaces(userOf(c), c.req.param('orgId')),
        }),
      )
      .post('/organizations/:orgId/spaces', async (c) => {
        const body = (await json(c)) as { name?: string; slug?: string; defaultLocale?: string }
        const space = await c.var.services
          .get(TENANCY_SERVICE)
          .createSpace(userOf(c), c.req.param('orgId'), {
            name: body.name ?? '',
            slug: body.slug ?? '',
            ...(body.defaultLocale === undefined ? {} : { defaultLocale: body.defaultLocale }),
          })
        return c.json(space, 201)
      })
      .get('/spaces/:spaceId', async (c) =>
        c.json(
          await c.var.services.get(TENANCY_SERVICE).getSpace(userOf(c), c.req.param('spaceId')),
        ),
      )
      .patch('/spaces/:spaceId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .updateSpace(
              userOf(c),
              c.req.param('spaceId'),
              (await json(c)) as { name?: string; slug?: string },
            ),
        ),
      )
      .delete('/spaces/:spaceId', async (c) => {
        await c.var.services.get(TENANCY_SERVICE).deleteSpace(userOf(c), c.req.param('spaceId'))
        return c.body(null, 204)
      })
      // Organization members
      .get('/organizations/:orgId/members', async (c) => {
        const organizationId = c.req.param('orgId')
        const memberships = c.var.services.get(MEMBERSHIP_SERVICE)
        await requireOrganizationMember(memberships, userOf(c), organizationId)
        return c.json({
          members: await present(c, await memberships.listMembers({ organizationId })),
        })
      })
      .post('/organizations/:orgId/members', async (c) => {
        const organizationId = c.req.param('orgId')
        await requireOrganizationManager(
          c.var.services.get(MEMBERSHIP_SERVICE),
          userOf(c),
          organizationId,
        )
        const input = await validate(addMemberInput(organizationRoleSchema), await json(c), {
          message: 'Invalid member',
        })
        await assertOwnerChange(c, organizationId, [input.role as string])
        return c.json(
          await addByEmail(c, { organizationId }, input.email, input.role as string),
          201,
        )
      })
      .patch('/organizations/:orgId/members/:membershipId', async (c) => {
        const organizationId = c.req.param('orgId')
        const memberships = c.var.services.get(MEMBERSHIP_SERVICE)
        await requireOrganizationManager(memberships, userOf(c), organizationId)
        const { role } = await validate(z.object({ role: organizationRoleSchema }), await json(c), {
          message: 'Invalid role',
        })
        const current = (await memberships.listMembers({ organizationId })).find(
          (m) => m.id === c.req.param('membershipId'),
        )
        await assertOwnerChange(c, organizationId, [role, current?.role])
        const updated = await memberships.changeRole(
          c.req.param('membershipId'),
          { organizationId },
          role,
        )
        return c.json((await present(c, [updated]))[0])
      })
      .delete('/organizations/:orgId/members/:membershipId', async (c) => {
        const organizationId = c.req.param('orgId')
        const memberships = c.var.services.get(MEMBERSHIP_SERVICE)
        await requireOrganizationManager(memberships, userOf(c), organizationId)
        const current = (await memberships.listMembers({ organizationId })).find(
          (m) => m.id === c.req.param('membershipId'),
        )
        await assertOwnerChange(c, organizationId, [current?.role])
        await memberships.remove(c.req.param('membershipId'), { organizationId })
        return c.body(null, 204)
      })
      // Space members
      .get('/spaces/:spaceId/members', async (c) => {
        const space = await c.var.services
          .get(TENANCY_SERVICE)
          .getSpace(userOf(c), c.req.param('spaceId'))
        const members = await c.var.services
          .get(MEMBERSHIP_SERVICE)
          .listMembers({ organizationId: space.organizationId, spaceId: space.id })
        return c.json({ members: await present(c, members) })
      })
      .post('/spaces/:spaceId/members', async (c) => {
        const scope = await manageableSpace(c)
        const input = await validate(addMemberInput(spaceRoleSchema), await json(c), {
          message: 'Invalid member',
        })
        return c.json(await addByEmail(c, scope, input.email, input.role as string), 201)
      })
      .patch('/spaces/:spaceId/members/:membershipId', async (c) => {
        const scope = await manageableSpace(c)
        const { role } = await validate(z.object({ role: spaceRoleSchema }), await json(c), {
          message: 'Invalid role',
        })
        const updated = await c.var.services
          .get(MEMBERSHIP_SERVICE)
          .changeRole(c.req.param('membershipId'), scope, role)
        return c.json((await present(c, [updated]))[0])
      })
      .delete('/spaces/:spaceId/members/:membershipId', async (c) => {
        const scope = await manageableSpace(c)
        await c.var.services.get(MEMBERSHIP_SERVICE).remove(c.req.param('membershipId'), scope)
        return c.body(null, 204)
      })
  )
}

/** The space scope, if the actor may manage its members (404 otherwise). */
async function manageableSpace(c: Ctx): Promise<{ organizationId: string; spaceId: string }> {
  const space = await c.var.services
    .get(TENANCY_SERVICE)
    .getSpace(userOf(c), c.req.param('spaceId') ?? '')
  const access = await requireSpaceAccess(
    c.var.services.get(MEMBERSHIP_SERVICE),
    userOf(c),
    space.organizationId,
    space.id,
  )
  if (!canManageSpace(access)) throw new NotFoundError('Space not found')
  return { organizationId: space.organizationId, spaceId: space.id }
}
