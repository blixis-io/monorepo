import {
  type Actor,
  type AuthorizationService,
  createServiceToken,
  NotFoundError,
  type ServiceToken,
  validate,
} from '@blixis/contracts'
import { type Database, isId } from '@blixis/database'
import type { RoleService } from '@blixis/permissions'
import type { Membership, MembershipScope, MembershipService, UserService } from '@blixis/users'
import { z } from 'zod'
import { spaceRepository } from '../infrastructure/repositories.ts'
import { SPACES_PERMISSIONS as P } from '../permissions.ts'
import { organizationResource, spaceResource } from './access.ts'

/** A membership with its user's email and display name (for management UIs). */
export interface Member {
  readonly id: string
  readonly userId: string
  readonly email: string | null
  readonly displayName: string | null
  /** A system role key or a custom role id. */
  readonly role: string
  readonly createdAt: string
}

/**
 * Members of organizations and spaces on behalf of an actor (plan 009). Listing needs
 * `organizations.read` / `spaces.read`; changes need `organizations.members.manage` /
 * `spaces.members.manage`, and the actor must hold every permission of the role granted or taken
 * away (`ROLE_SERVICE.assertCanGrant`) — so only owners can make or unmake owners. Membership
 * rows are stored by `@blixis/users`. Request-scoped: `services.get(MEMBER_SERVICE)`.
 */
export interface MemberService {
  listOrganizationMembers(actor: Actor, organizationId: string): Promise<Member[]>
  /**
   * Adds an existing user by email (invitations are deferred).
   * @throws NotFoundError (unknown email), ValidationError (unknown role), ConflictError
   */
  addOrganizationMember(
    actor: Actor,
    organizationId: string,
    input: { email: string; role: string },
  ): Promise<Member>
  /** @throws NotFoundError, ValidationError, ForbiddenError, ConflictError (last owner) */
  changeOrganizationMemberRole(
    actor: Actor,
    organizationId: string,
    membershipId: string,
    role: string,
  ): Promise<Member>
  /** @throws NotFoundError, ForbiddenError, ConflictError (last owner) */
  removeOrganizationMember(
    actor: Actor,
    organizationId: string,
    membershipId: string,
  ): Promise<void>
  listSpaceMembers(actor: Actor, spaceId: string): Promise<Member[]>
  addSpaceMember(
    actor: Actor,
    spaceId: string,
    input: { email: string; role: string },
  ): Promise<Member>
  changeSpaceMemberRole(
    actor: Actor,
    spaceId: string,
    membershipId: string,
    role: string,
  ): Promise<Member>
  removeSpaceMember(actor: Actor, spaceId: string, membershipId: string): Promise<void>
}

/** Request-scoped {@link MemberService}, provided by `spacesModule()`. */
export const MEMBER_SERVICE: ServiceToken<MemberService> =
  createServiceToken<MemberService>('@blixis/spaces.members')

const addInput = z.object({
  email: z.string().trim().toLowerCase().max(254),
  role: z.string().trim().min(1).max(64),
})
const roleInput = z.object({ role: z.string().trim().min(1).max(64) })

/** Creates the {@link MemberService} of one request scope. */
export function createMemberService(deps: {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly roles: RoleService
  readonly memberships: MembershipService
  readonly users: UserService
}): MemberService {
  const { db, authz, roles, memberships, users } = deps

  async function present(list: readonly Membership[]): Promise<Member[]> {
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
  const one = async (m: Membership) => (await present([m]))[0] as Member

  /** Checks `manage` on the scope's tenant (organization or space). */
  const requireManage = (actor: Actor, scope: MembershipScope) =>
    scope.spaceId === undefined
      ? authz.require({
          actor,
          action: P.organizationMembersManage.id,
          resource: organizationResource(scope.organizationId),
        })
      : authz.require({
          actor,
          action: P.spaceMembersManage.id,
          resource: spaceResource({ organizationId: scope.organizationId, spaceId: scope.spaceId }),
        })

  /** The space's tenant scope; 404 for unknown spaces (access is checked by the caller). */
  async function spaceScope(spaceId: string): Promise<Required<MembershipScope>> {
    const space = isId(spaceId) ? await spaceRepository.findForResolution(db, spaceId) : undefined
    if (space === undefined) throw new NotFoundError('Space not found')
    return { organizationId: space.organizationId, spaceId: space.id }
  }

  /** The membership at exactly this level; 404 otherwise (never another tenant's row). */
  async function existing(scope: MembershipScope, membershipId: string): Promise<Membership> {
    const found = (await memberships.listMembers(scope)).find((m) => m.id === membershipId)
    if (found === undefined) throw new NotFoundError('Membership not found')
    return found
  }

  async function add(actor: Actor, scope: MembershipScope, body: unknown): Promise<Member> {
    await requireManage(actor, scope)
    const input = await validate(addInput, body, { message: 'Invalid member' })
    await roles.assertCanGrant(actor, scope, input.role)
    const user = await users.findByEmail(input.email)
    if (user === undefined) {
      throw new NotFoundError(
        'No user with this email. Invitations are not available yet: create the account first (pnpm auth:create-user).',
      )
    }
    const created =
      scope.spaceId === undefined
        ? await memberships.addOrganizationMember({
            userId: user.id,
            organizationId: scope.organizationId,
            role: input.role,
          })
        : await memberships.addSpaceMember({
            userId: user.id,
            organizationId: scope.organizationId,
            spaceId: scope.spaceId,
            role: input.role,
          })
    return one(created)
  }

  async function change(
    actor: Actor,
    scope: MembershipScope,
    membershipId: string,
    body: unknown,
  ): Promise<Member> {
    await requireManage(actor, scope)
    const { role } = await validate(roleInput, body, { message: 'Invalid role' })
    const current = await existing(scope, membershipId)
    // Taking a role away is guarded like granting it.
    await roles.assertCanGrant(actor, scope, current.role)
    await roles.assertCanGrant(actor, scope, role)
    return one(await memberships.changeRole(membershipId, scope, role))
  }

  async function remove(actor: Actor, scope: MembershipScope, membershipId: string) {
    await requireManage(actor, scope)
    const current = await existing(scope, membershipId)
    await roles.assertCanGrant(actor, scope, current.role)
    await memberships.remove(membershipId, scope)
  }

  return {
    async listOrganizationMembers(actor, organizationId) {
      await authz.require({
        actor,
        action: P.organizationRead.id,
        resource: organizationResource(organizationId),
      })
      return present(await memberships.listMembers({ organizationId }))
    },
    addOrganizationMember: (actor, organizationId, input) => add(actor, { organizationId }, input),
    changeOrganizationMemberRole: (actor, organizationId, membershipId, role) =>
      change(actor, { organizationId }, membershipId, { role }),
    removeOrganizationMember: (actor, organizationId, membershipId) =>
      remove(actor, { organizationId }, membershipId),

    async listSpaceMembers(actor, spaceId) {
      const scope = await spaceScope(spaceId)
      await authz.require({ actor, action: P.spaceRead.id, resource: spaceResource(scope) })
      return present(await memberships.listMembers(scope))
    },
    addSpaceMember: async (actor, spaceId, input) => add(actor, await spaceScope(spaceId), input),
    changeSpaceMemberRole: async (actor, spaceId, membershipId, role) =>
      change(actor, await spaceScope(spaceId), membershipId, { role }),
    removeSpaceMember: async (actor, spaceId, membershipId) =>
      remove(actor, await spaceScope(spaceId), membershipId),
  }
}
