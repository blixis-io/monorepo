/**
 * `@blixis/users` — user records and profiles (architecture §30). Other modules use
 * `USER_SERVICE`; they never read the users table.
 *
 * @packageDocumentation
 */
export {
  createMembershipService,
  MEMBERSHIP_SERVICE,
  type MembershipService,
} from './application/membership.service.ts'
export { createUserService, USER_SERVICE, type UserService } from './application/user.service.ts'
export {
  type Membership,
  type MembershipScope,
  ORGANIZATION_ROLES,
  type OrganizationRole,
  organizationRoleSchema,
  SPACE_ROLES,
  type SpaceAccess,
  type SpaceRole,
  spaceRoleSchema,
} from './domain/membership.ts'
export {
  type CreateUserInput,
  displayNameSchema,
  emailSchema,
  normalizeEmail,
  type UpdateProfileInput,
  type User,
  type UserStatus,
} from './domain/user.ts'
export {
  membershipCreated,
  membershipRemoved,
  userCreated,
  userDisabled,
  userUpdated,
} from './events.ts'
export { usersModule } from './module.ts'
