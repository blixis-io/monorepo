import { type Actor, NotFoundError, UnauthorizedError } from '@blixis/contracts'
import type { MembershipService, OrganizationRole, SpaceAccess } from '@blixis/users'

/** The user an actor acts for: users themselves, API tokens their owner (§30). */
export function actingUserId(actor: Actor): string {
  if (actor.type === 'user') return actor.userId
  if (actor.type === 'apiToken') return actor.ownerId
  throw new UnauthorizedError('Sign in to access organizations and spaces')
}

const MANAGERS: readonly OrganizationRole[] = ['owner', 'admin']

// TODO(009.004): replace these membership/role checks with permission checks.
// Non-members always get 404 — resource existence is never revealed (§31).

/** The actor's organization role; `NotFoundError` if they are not an organization member. */
export async function requireOrganizationMember(
  memberships: MembershipService,
  userId: string,
  organizationId: string,
): Promise<OrganizationRole> {
  const membership = await memberships.getMembership(userId, { organizationId })
  if (membership === undefined) throw new NotFoundError('Organization not found')
  return membership.role as OrganizationRole
}

/** Requires an organization owner or admin; members without it get 404 as well. */
export async function requireOrganizationManager(
  memberships: MembershipService,
  userId: string,
  organizationId: string,
): Promise<void> {
  const role = await requireOrganizationMember(memberships, userId, organizationId)
  if (!MANAGERS.includes(role)) throw new NotFoundError('Organization not found')
}

/** Access to a space via its organization or the space; `NotFoundError` without either. */
export async function requireSpaceAccess(
  memberships: MembershipService,
  userId: string,
  organizationId: string,
  spaceId: string,
): Promise<SpaceAccess> {
  const access = await memberships.getSpaceAccess(userId, organizationId, spaceId)
  if (access.organizationRole === null && access.spaceRole === null)
    throw new NotFoundError('Space not found')
  return access
}

/** Organization owners/admins and space admins manage a space. */
export function canManageSpace(access: SpaceAccess): boolean {
  return (
    (access.organizationRole !== null && MANAGERS.includes(access.organizationRole)) ||
    access.spaceRole === 'admin'
  )
}
