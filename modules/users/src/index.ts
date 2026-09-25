/**
 * `@blixis/users` — user records and profiles (architecture §30). Other modules use
 * `USER_SERVICE`; they never read the users table.
 *
 * @packageDocumentation
 */
export { createUserService, USER_SERVICE, type UserService } from './application/user.service.ts'
export {
  type CreateUserInput,
  displayNameSchema,
  emailSchema,
  normalizeEmail,
  type UpdateProfileInput,
  type User,
  type UserStatus,
} from './domain/user.ts'
export { userCreated, userDisabled, userUpdated } from './events.ts'
export { usersModule } from './module.ts'
