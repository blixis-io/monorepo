import {
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type ServiceToken,
  type TransactionScope,
  ValidationError,
} from '@blixis/contracts'
import {
  type Database,
  fromTransactionScope,
  newId,
  type Transaction,
  translateDatabaseError,
  withTransaction,
} from '@blixis/database'
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm'
import {
  type Membership,
  type MembershipScope,
  ORGANIZATION_ROLES,
  type OrganizationRole,
  SPACE_ROLES,
  type SpaceAccess,
  type SpaceRole,
} from '../domain/membership.ts'
import { membershipCreated, membershipRemoved } from '../events.ts'
import { memberships } from '../infrastructure/schema.ts'

/** Memberships of users in organizations and spaces (§20). Request-scoped. */
export interface MembershipService {
  /** @throws ValidationError (unknown role), ConflictError (already a member) */
  addOrganizationMember(
    input: { userId: string; organizationId: string; role: OrganizationRole },
    options?: { readonly transaction?: TransactionScope },
  ): Promise<Membership>
  /** @throws ValidationError, ConflictError */
  addSpaceMember(
    input: { userId: string; organizationId: string; spaceId: string; role: SpaceRole },
    options?: { readonly transaction?: TransactionScope },
  ): Promise<Membership>
  /** Members at exactly this level (organization-level or space-level), oldest first. */
  listMembers(scope: MembershipScope): Promise<Membership[]>
  /** The user's membership at exactly this level, if any. */
  getMembership(userId: string, scope: MembershipScope): Promise<Membership | undefined>
  /** All memberships of a user (organizations and spaces). */
  listMembershipsForUser(userId: string): Promise<Membership[]>
  /** Roles a user holds for a space, through its organization and/or the space. */
  getSpaceAccess(userId: string, organizationId: string, spaceId: string): Promise<SpaceAccess>
  /** @throws NotFoundError, ValidationError, ConflictError (would leave no owner) */
  changeRole(membershipId: string, scope: MembershipScope, role: string): Promise<Membership>
  /** @throws NotFoundError, ConflictError (last owner) */
  remove(membershipId: string, scope: MembershipScope): Promise<void>
  /** Removes every membership of a space (space deletion), in the caller's transaction. */
  removeAllForSpace(
    organizationId: string,
    spaceId: string,
    options: { readonly transaction: TransactionScope },
  ): Promise<void>
}

/** Request-scoped {@link MembershipService}, provided by `usersModule()`. */
export const MEMBERSHIP_SERVICE: ServiceToken<MembershipService> =
  createServiceToken<MembershipService>('@blixis/users.memberships')

type Row = typeof memberships.$inferSelect
const toMembership = (row: Row): Membership => ({
  id: row.id,
  userId: row.userId,
  organizationId: row.organizationId,
  spaceId: row.spaceId,
  role: row.roleKey,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const levelOf = (scope: MembershipScope): SQL =>
  and(
    eq(memberships.organizationId, scope.organizationId),
    scope.spaceId === undefined
      ? isNull(memberships.spaceId)
      : eq(memberships.spaceId, scope.spaceId),
  ) as SQL

const invalidRole = (role: string, allowed: readonly string[]) =>
  new ValidationError('Unknown role', [
    { path: ['role'], message: `Use one of: ${allowed.join(', ')} (got ${role})` },
  ])

/** Creates the {@link MembershipService} of one request scope. */
export function createMembershipService(deps: {
  readonly db: Database
  readonly events: EventBus
}): MembershipService {
  const { db, events } = deps

  async function insert(
    q: Database | Transaction,
    values: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Membership> {
    try {
      const [row] = await q
        .insert(memberships)
        .values({ id: newId(), ...values })
        .returning()
      if (row === undefined) throw new Error('insert returned no row')
      return toMembership(row)
    } catch (error) {
      const translated = translateDatabaseError(error)
      if (translated instanceof ConflictError)
        throw new ConflictError('The user is already a member here')
      throw translated
    }
  }

  /** Locks the organization's owner rows and fails if `excluding` is the only owner (§ invariant). */
  async function assertAnotherOwner(
    tx: Transaction,
    organizationId: string,
    excluding: string,
  ): Promise<void> {
    const owners = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          isNull(memberships.spaceId),
          eq(memberships.roleKey, 'owner'),
        ),
      )
      .for('update')
    if (!owners.some((owner) => owner.id !== excluding)) {
      throw new ConflictError('An organization must keep at least one owner')
    }
  }

  async function locked(
    tx: Transaction,
    membershipId: string,
    scope: MembershipScope,
  ): Promise<Row> {
    const [row] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, membershipId), levelOf(scope)))
      .for('update')
    if (row === undefined) throw new NotFoundError('Membership not found')
    return row
  }

  const emitCreated = (m: Membership) =>
    events.emit(membershipCreated, {
      membershipId: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      spaceId: m.spaceId,
      role: m.role,
    })

  return {
    async addOrganizationMember(input, options = {}) {
      if (!(ORGANIZATION_ROLES as readonly string[]).includes(input.role))
        throw invalidRole(input.role, ORGANIZATION_ROLES)
      const q = options.transaction === undefined ? db : fromTransactionScope(options.transaction)
      const membership = await insert(q, {
        userId: input.userId,
        organizationId: input.organizationId,
        spaceId: null,
        roleKey: input.role,
      })
      await emitCreated(membership)
      return membership
    },

    async addSpaceMember(input, options = {}) {
      if (!(SPACE_ROLES as readonly string[]).includes(input.role))
        throw invalidRole(input.role, SPACE_ROLES)
      const q = options.transaction === undefined ? db : fromTransactionScope(options.transaction)
      const membership = await insert(q, {
        userId: input.userId,
        organizationId: input.organizationId,
        spaceId: input.spaceId,
        roleKey: input.role,
      })
      await emitCreated(membership)
      return membership
    },

    async listMembers(scope) {
      const rows = await db
        .select()
        .from(memberships)
        .where(levelOf(scope))
        .orderBy(asc(memberships.createdAt))
      return rows.map(toMembership)
    },

    async getMembership(userId, scope) {
      const [row] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), levelOf(scope)))
      return row === undefined ? undefined : toMembership(row)
    },

    async listMembershipsForUser(userId) {
      const rows = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, userId))
        .orderBy(asc(memberships.createdAt))
      return rows.map(toMembership)
    },

    async getSpaceAccess(userId, organizationId, spaceId) {
      const rows = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
      const org = rows.find((r) => r.spaceId === null)
      const space = rows.find((r) => r.spaceId === spaceId)
      return {
        organizationRole: (org?.roleKey as OrganizationRole | undefined) ?? null,
        spaceRole: (space?.roleKey as SpaceRole | undefined) ?? null,
      }
    },

    async changeRole(membershipId, scope, role) {
      const allowed: readonly string[] =
        scope.spaceId === undefined ? ORGANIZATION_ROLES : SPACE_ROLES
      if (!allowed.includes(role)) throw invalidRole(role, allowed)
      return withTransaction(db, async (tx) => {
        const row = await locked(tx, membershipId, scope)
        if (scope.spaceId === undefined && row.roleKey === 'owner' && role !== 'owner') {
          await assertAnotherOwner(tx, scope.organizationId, membershipId)
        }
        const [updated] = await tx
          .update(memberships)
          .set({ roleKey: role })
          .where(eq(memberships.id, membershipId))
          .returning()
        return toMembership(updated ?? row)
      })
    },

    async remove(membershipId, scope) {
      const removed = await withTransaction(db, async (tx) => {
        const row = await locked(tx, membershipId, scope)
        if (scope.spaceId === undefined && row.roleKey === 'owner') {
          await assertAnotherOwner(tx, scope.organizationId, membershipId)
        }
        await tx.delete(memberships).where(eq(memberships.id, membershipId))
        return row
      })
      await events.emit(membershipRemoved, {
        membershipId: removed.id,
        userId: removed.userId,
        organizationId: removed.organizationId,
        spaceId: removed.spaceId,
      })
    },

    async removeAllForSpace(organizationId, spaceId, options) {
      await fromTransactionScope(options.transaction)
        .delete(memberships)
        .where(
          and(eq(memberships.organizationId, organizationId), eq(memberships.spaceId, spaceId)),
        )
    },
  }
}
