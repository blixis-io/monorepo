import {
  BlixisError,
  type ErrorCode,
  InfrastructureError,
  ValidationError,
} from '@blixis/contracts'
import { ERROR_REPORTER } from '@blixis/kernel'
import { type ExecutionResult, GraphQLError } from 'graphql'
import type { Plugin } from 'graphql-yoga'
import type { GraphQLContext } from './context.ts'

/** GraphQL `extensions.code` for an error code (manual: Concepts → Errors). */
function graphqlCode(code: ErrorCode | 'INTERNAL'): string {
  return code === 'MODULE_ERROR' ? 'INTERNAL' : code
}

/**
 * Maps one execution error to the client shape (plan 012.003): public `BlixisError`s keep their
 * message and code (`ValidationError`s add `issues`); anything else becomes `Unexpected error`
 * with code `INTERNAL`. Every error carries the `requestId`. Returns whether it was unexpected.
 */
export function mapGraphQLError(
  error: GraphQLError,
  requestId: string,
): { error: GraphQLError; unexpected: boolean } {
  const original = error.originalError
  const base = {
    nodes: error.nodes ?? null,
    path: error.path ?? null,
    positions: error.positions ?? null,
  }
  if (original === undefined || original === null || original instanceof GraphQLError) {
    // Parse/validation errors and GraphQLErrors thrown on purpose are client errors already.
    return {
      error: new GraphQLError(error.message, {
        ...base,
        extensions: { ...error.extensions, requestId },
      }),
      unexpected: false,
    }
  }
  if (original instanceof InfrastructureError) {
    // A dependency failed: the message stays hidden, but clients learn whether to retry.
    return {
      error: new GraphQLError('A dependency is unavailable', {
        ...base,
        extensions: { code: 'INFRASTRUCTURE_ERROR', retryable: original.retryable, requestId },
      }),
      unexpected: true,
    }
  }
  if (original instanceof BlixisError) {
    const exposed = original.expose
    return {
      error: new GraphQLError(exposed ? original.message : 'Unexpected error', {
        ...base,
        extensions: {
          code: exposed ? graphqlCode(original.code) : 'INTERNAL',
          requestId,
          ...(exposed && original instanceof ValidationError ? { issues: original.issues } : {}),
        },
      }),
      unexpected: !exposed,
    }
  }
  return {
    error: new GraphQLError('Unexpected error', {
      ...base,
      extensions: { code: 'INTERNAL', requestId },
    }),
    unexpected: true,
  }
}

const isResult = (value: unknown): value is ExecutionResult =>
  typeof value === 'object' && value !== null && !(Symbol.asyncIterator in value)

/**
 * Yoga plugin: maps execution errors with {@link mapGraphQLError}, and logs and reports the
 * unexpected ones (with request id, actor type, space) like the REST error handler does.
 */
export function useBlixisErrors(): Plugin<GraphQLContext> {
  return {
    onExecute({ args }) {
      const context = args.contextValue as GraphQLContext
      return {
        onExecuteDone({ result, setResult }) {
          if (!isResult(result) || result.errors === undefined) return
          const { requestContext, services } = context
          const errors = result.errors.map((raw) => {
            const mapped = mapGraphQLError(raw, requestContext.requestId)
            if (mapped.unexpected) {
              const original = raw.originalError ?? raw
              requestContext.logger.error('graphql resolver failed', {
                path: raw.path?.join('.'),
                error:
                  original instanceof Error
                    ? `${original.name}: ${original.message}`
                    : String(original),
              })
              try {
                services.getOptional(ERROR_REPORTER)?.captureException(original, {
                  requestId: requestContext.requestId,
                  correlationId: requestContext.correlationId,
                  actorType: requestContext.actor.type,
                  route: '/graphql',
                  ...(requestContext.tenant.spaceId === undefined
                    ? {}
                    : { spaceId: requestContext.tenant.spaceId }),
                })
              } catch {
                // Error reporting must never break the response.
              }
            }
            return mapped.error
          })
          setResult({ ...result, errors })
        },
      }
    },
  }
}
