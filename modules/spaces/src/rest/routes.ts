import { ForbiddenError, type ModuleHonoEnv } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { ENVIRONMENT_SERVICE, LOCALE_SERVICE } from '../application/locales.service.ts'
import { MEMBER_SERVICE } from '../application/members.service.ts'
import { TENANCY_SERVICE } from '../application/tenancy.service.ts'
import { spaceScoped } from '../application/tenant-resolver.ts'

type Ctx = Context<ModuleHonoEnv>
const actorOf = (c: Ctx) => c.var.requestContext.actor
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as unknown
const param = (c: Ctx, name: string) => c.req.param(name) ?? ''

/**
 * `/api/v1/organizations/*` and `/api/v1/spaces/*`. Handlers only translate HTTP ⇄ services;
 * the services check permissions (§30).
 */
export function spacesRoutes(options: { readonly allowOrganizationCreation: boolean }) {
  return (
    new Hono<ModuleHonoEnv>()
      .get('/organizations', async (c) =>
        c.json({
          organizations: await c.var.services.get(TENANCY_SERVICE).listOrganizations(actorOf(c)),
        }),
      )
      .post('/organizations', async (c) => {
        if (!options.allowOrganizationCreation)
          throw new ForbiddenError('Organization creation is disabled')
        const body = (await json(c)) as { name?: string; slug?: string }
        return c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .createOrganization(actorOf(c), { name: body.name ?? '', slug: body.slug ?? '' }),
          201,
        )
      })
      .get('/organizations/:orgId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .getOrganization(actorOf(c), c.req.param('orgId')),
        ),
      )
      .patch('/organizations/:orgId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .renameOrganization(
              actorOf(c),
              c.req.param('orgId'),
              (await json(c)) as { name?: string; slug?: string },
            ),
        ),
      )
      .get('/organizations/:orgId/spaces', async (c) =>
        c.json({
          spaces: await c.var.services
            .get(TENANCY_SERVICE)
            .listSpaces(actorOf(c), c.req.param('orgId')),
        }),
      )
      .post('/organizations/:orgId/spaces', async (c) => {
        const body = (await json(c)) as { name?: string; slug?: string; defaultLocale?: string }
        const space = await c.var.services
          .get(TENANCY_SERVICE)
          .createSpace(actorOf(c), c.req.param('orgId'), {
            name: body.name ?? '',
            slug: body.slug ?? '',
            ...(body.defaultLocale === undefined ? {} : { defaultLocale: body.defaultLocale }),
          })
        return c.json(space, 201)
      })
      .get('/spaces/:spaceId', async (c) =>
        c.json(
          await c.var.services.get(TENANCY_SERVICE).getSpace(actorOf(c), c.req.param('spaceId')),
        ),
      )
      .patch('/spaces/:spaceId', async (c) =>
        c.json(
          await c.var.services
            .get(TENANCY_SERVICE)
            .updateSpace(
              actorOf(c),
              c.req.param('spaceId'),
              (await json(c)) as { name?: string; slug?: string },
            ),
        ),
      )
      .delete('/spaces/:spaceId', async (c) => {
        await c.var.services.get(TENANCY_SERVICE).deleteSpace(actorOf(c), c.req.param('spaceId'))
        return c.body(null, 204)
      })
      // Environments (read-only in the MVP) and locales — the canonical space-scoped pattern:
      // spaceScoped() verifies access and binds the tenant; handlers read it from the context.
      .get('/spaces/:spaceId/environments', spaceScoped(), async (c) =>
        c.json({
          environments: await c.var.services
            .get(ENVIRONMENT_SERVICE)
            .list(actorOf(c), spaceTenant(c)),
        }),
      )
      .get('/spaces/:spaceId/locales', spaceScoped(), async (c) =>
        c.json({
          locales: await c.var.services.get(LOCALE_SERVICE).list(actorOf(c), spaceTenant(c)),
        }),
      )
      .post('/spaces/:spaceId/locales', spaceScoped(), async (c) =>
        c.json(
          await c.var.services
            .get(LOCALE_SERVICE)
            .create(actorOf(c), spaceTenant(c), (await json(c)) as { code: string }),
          201,
        ),
      )
      .patch('/spaces/:spaceId/locales/:localeId', spaceScoped(), async (c) =>
        c.json(
          await c.var.services
            .get(LOCALE_SERVICE)
            .update(actorOf(c), spaceTenant(c), param(c, 'localeId'), (await json(c)) as object),
        ),
      )
      .delete('/spaces/:spaceId/locales/:localeId', spaceScoped(), async (c) => {
        await c.var.services
          .get(LOCALE_SERVICE)
          .delete(actorOf(c), spaceTenant(c), param(c, 'localeId'))
        return c.body(null, 204)
      })
      // Organization members
      .get('/organizations/:orgId/members', async (c) =>
        c.json({
          members: await c.var.services
            .get(MEMBER_SERVICE)
            .listOrganizationMembers(actorOf(c), c.req.param('orgId')),
        }),
      )
      .post('/organizations/:orgId/members', async (c) =>
        c.json(
          await c.var.services
            .get(MEMBER_SERVICE)
            .addOrganizationMember(
              actorOf(c),
              c.req.param('orgId'),
              (await json(c)) as { email: string; role: string },
            ),
          201,
        ),
      )
      .patch('/organizations/:orgId/members/:membershipId', async (c) =>
        c.json(
          await c.var.services
            .get(MEMBER_SERVICE)
            .changeOrganizationMemberRole(
              actorOf(c),
              c.req.param('orgId'),
              c.req.param('membershipId'),
              ((await json(c)) as { role?: string }).role ?? '',
            ),
        ),
      )
      .delete('/organizations/:orgId/members/:membershipId', async (c) => {
        await c.var.services
          .get(MEMBER_SERVICE)
          .removeOrganizationMember(actorOf(c), c.req.param('orgId'), c.req.param('membershipId'))
        return c.body(null, 204)
      })
      // Space members
      .get('/spaces/:spaceId/members', async (c) =>
        c.json({
          members: await c.var.services
            .get(MEMBER_SERVICE)
            .listSpaceMembers(actorOf(c), c.req.param('spaceId')),
        }),
      )
      .post('/spaces/:spaceId/members', async (c) =>
        c.json(
          await c.var.services
            .get(MEMBER_SERVICE)
            .addSpaceMember(
              actorOf(c),
              c.req.param('spaceId'),
              (await json(c)) as { email: string; role: string },
            ),
          201,
        ),
      )
      .patch('/spaces/:spaceId/members/:membershipId', async (c) =>
        c.json(
          await c.var.services
            .get(MEMBER_SERVICE)
            .changeSpaceMemberRole(
              actorOf(c),
              c.req.param('spaceId'),
              c.req.param('membershipId'),
              ((await json(c)) as { role?: string }).role ?? '',
            ),
        ),
      )
      .delete('/spaces/:spaceId/members/:membershipId', async (c) => {
        await c.var.services
          .get(MEMBER_SERVICE)
          .removeSpaceMember(actorOf(c), c.req.param('spaceId'), c.req.param('membershipId'))
        return c.body(null, 204)
      })
  )
}

/** The verified space tenant bound by {@link spaceScoped}. */
function spaceTenant(c: Ctx): { organizationId: string; spaceId: string } {
  const { organizationId, spaceId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
  )
  return { organizationId, spaceId }
}
