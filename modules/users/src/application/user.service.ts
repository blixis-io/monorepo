import {
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type ServiceToken,
  type TransactionScope,
  validate,
} from '@blixis/contracts'
import {
  type Database,
  fromTransactionScope,
  toTransactionScope,
  withTransaction,
} from '@blixis/database'
import {
  type CreateUserInput,
  createUserSchema,
  normalizeEmail,
  type UpdateProfileInput,
  type User,
  updateProfileSchema,
} from '../domain/user.ts'
import { userCreated, userDisabled, userUpdated } from '../events.ts'
import { userRepository } from '../infrastructure/user.repository.ts'

/** Users of the platform (architecture §30). Resolve per request: `services.get(USER_SERVICE)`. */
export interface UserService {
  /** @throws NotFoundError */
  getById(id: string): Promise<User>
  findById(id: string): Promise<User | undefined>
  /** Looks up by email (normalized). */
  findByEmail(email: string): Promise<User | undefined>
  /**
   * Creates a user and emits the transactional `user.created`. Pass `transaction` to create the
   * user atomically with other writes (e.g. credentials in `@blixis/auth`).
   * @throws ValidationError for invalid input; ConflictError when the email is taken.
   */
  create(
    input: CreateUserInput,
    options?: { readonly transaction?: TransactionScope },
  ): Promise<User>
  /** @throws ValidationError, NotFoundError */
  updateProfile(id: string, input: UpdateProfileInput): Promise<User>
  /**
   * Disables a user and emits the transactional `user.disabled` (credentials are revoked by
   * `@blixis/auth`) plus `user.updated`. @throws NotFoundError
   */
  disable(id: string): Promise<User>
}

/** Request-scoped {@link UserService}, provided by `usersModule()`. */
export const USER_SERVICE: ServiceToken<UserService> =
  createServiceToken<UserService>('@blixis/users.service')

/** Creates the {@link UserService} of one request scope. */
export function createUserService(deps: {
  readonly db: Database
  readonly events: EventBus
}): UserService {
  const { db, events } = deps

  const notFound = () => new NotFoundError('User not found')

  const service: UserService = {
    async getById(id) {
      return (await service.findById(id)) ?? Promise.reject(notFound())
    },
    findById: (id) => userRepository.findById(db, id),
    findByEmail: (email) => userRepository.findByEmail(db, normalizeEmail(email)),

    async create(input, options = {}) {
      const values = await validate(createUserSchema, input)
      const run = async (scope: TransactionScope) => {
        const tx = fromTransactionScope(scope)
        const user = await userRepository.insert(tx, values).catch((error: unknown) => {
          if (error instanceof ConflictError)
            throw new ConflictError('A user with this email already exists')
          throw error
        })
        await events.emit(
          userCreated,
          { userId: user.id, email: user.email, displayName: user.displayName },
          { transaction: scope },
        )
        return user
      }
      return options.transaction === undefined
        ? withTransaction(db, (tx) => run(toTransactionScope(tx)))
        : run(options.transaction)
    },

    async updateProfile(id, input) {
      const values = await validate(updateProfileSchema, input)
      const user = await userRepository.update(db, id, values)
      if (user === undefined) throw notFound()
      await events.emit(userUpdated, { userId: id, changed: ['displayName'] })
      return user
    },

    async disable(id) {
      const user = await withTransaction(db, async (tx) => {
        const updated = await userRepository.update(tx, id, { status: 'disabled' })
        if (updated === undefined) throw notFound()
        await events.emit(userDisabled, { userId: id }, { transaction: toTransactionScope(tx) })
        return updated
      })
      await events.emit(userUpdated, { userId: id, changed: ['status'] })
      return user
    },
  }
  return service
}
