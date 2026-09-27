import type { BlixisModule, RestContribution, RestOperation } from '@blixis/contracts'
import { z } from 'zod'

/** Mount prefix of the Management API (kernel `API_PREFIX`). */
const API_PREFIX = '/api/v1'

type Json = Record<string, unknown>

/** Every operation of the module list with its full path, e.g. `/api/v1/entries/{entryId}`. */
export interface CollectedOperation extends RestOperation {
  readonly module: string
  /** Hono pattern of the full path, e.g. `/api/v1/entries/:entryId`. */
  readonly route: string
}

const join = (a: string, b: string) => `${a}/${b}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')

const contributions = (module: BlixisModule): readonly RestContribution[] =>
  module.rest === undefined
    ? []
    : Array.isArray(module.rest)
      ? module.rest
      : [module.rest as RestContribution]

export function collectOperations(modules: readonly BlixisModule[]): CollectedOperation[] {
  return modules.flatMap((module) =>
    contributions(module).flatMap((rest) =>
      (rest.operations ?? []).map((operation) => ({
        ...operation,
        module: module.meta.name,
        route: join(join(rest.root === true ? '' : API_PREFIX, rest.path), operation.path),
      })),
    ),
  )
}

const READINESS = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    checks: z.record(
      z.string(),
      z.object({ status: z.enum(['ok', 'fail']), latencyMs: z.number() }),
    ),
  })
  .meta({ id: 'Readiness', description: 'Readiness report (no hosts or error messages)' })

/** Routes of the kernel itself (not module contributions). */
const KERNEL_OPERATIONS: CollectedOperation[] = [
  {
    module: '@blixis/kernel',
    route: '/api/v1/health',
    method: 'GET',
    path: '/health',
    id: 'getHealth',
    tag: 'Platform',
    summary: 'Liveness: answers before modules boot',
    auth: false,
    responses: { 200: { description: 'Alive', schema: z.object({ status: z.literal('ok') }) } },
  },
  {
    module: '@blixis/kernel',
    route: '/api/v1/health/ready',
    method: 'GET',
    path: '/health/ready',
    id: 'getReadiness',
    tag: 'Platform',
    summary: 'Readiness: modules booted and health checks passing (503 otherwise)',
    auth: false,
    responses: {
      200: { description: 'Ready', schema: READINESS },
      503: { description: 'Not ready (same body, `status: "unavailable"`)', schema: READINESS },
    },
  },
]

/** The problem details body of every error (RFC 9457, docs/contracts/errors.md). */
const PROBLEM: Json = {
  type: 'object',
  description: 'RFC 9457 problem details (docs/contracts/errors.md)',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    code: {
      type: 'string',
      enum: [
        'VALIDATION_FAILED',
        'NOT_FOUND',
        'CONFLICT',
        'FORBIDDEN',
        'UNAUTHORIZED',
        'RATE_LIMITED',
        'MODULE_ERROR',
        'INFRASTRUCTURE_ERROR',
        'INTERNAL',
      ],
    },
    detail: { type: 'string' },
    requestId: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'array', items: { type: ['string', 'integer'] } },
          message: { type: 'string' },
          code: { type: 'string' },
        },
        required: ['path', 'message'],
      },
    },
    details: {},
  },
  required: ['type', 'title', 'status', 'code', 'requestId'],
}

const ERRORS: Record<string, string> = {
  '400': 'Invalid input (`VALIDATION_FAILED`)',
  '401': 'Missing or invalid credentials',
  '403': 'Not allowed (member without the permission)',
  '404': 'Not found, or in a tenant you are not a member of',
  '409': 'Conflict, e.g. a stale version',
}

/**
 * Converts every Zod schema of the operations in one pass: schemas named with `.meta({ id })`
 * become `components.schemas`, everything else is inlined with `$ref`s to them.
 */
function convertSchemas(schemas: readonly unknown[], io: 'input' | 'output') {
  const registry = z.registry<{ id: string }>()
  const slots = new Map<unknown, string>()
  let n = 0
  for (const schema of schemas) {
    if (schema === undefined || schema === 'binary' || slots.has(schema)) continue
    if (!(schema instanceof z.ZodType))
      throw new Error('OpenAPI generation needs Zod schemas (ADR 0015)')
    const id = `__slot${n++}`
    slots.set(schema, id)
    if (!registry.has(schema)) registry.add(schema, { id })
  }
  const converted = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    unrepresentable: 'any',
    io,
  }) as { schemas: Record<string, Json> }

  // Slots of named schemas (`.meta({ id })`) are referenced by name, never inlined.
  const slotNames = new Map<string, string>()
  for (const [schema, id] of slots) {
    const named = (schema as z.ZodType).meta()?.['id']
    if (typeof named === 'string') slotNames.set(id, named)
  }
  const SAFE = 9007199254740991
  const SHARED = '#/components/schemas/__shared#/$defs/'
  const fix = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(fix)
    if (value === null || typeof value !== 'object') return value
    const ref = (value as Json)['$ref']
    if (typeof ref === 'string') {
      // A reused anonymous schema got a slot of its own: inline it.
      const slot = /^#\/components\/schemas\/(__slot\d+)$/.exec(ref)?.[1]
      if (slot !== undefined) {
        const named = slotNames.get(slot)
        return named === undefined
          ? fix(converted.schemas[slot])
          : { $ref: `#/components/schemas/${named}` }
      }
      const name = ref.startsWith(SHARED)
        ? ref.slice(SHARED.length)
        : ref.startsWith('#/$defs/')
          ? ref.slice('#/$defs/'.length)
          : undefined
      if (name !== undefined) return { ...value, $ref: `#/components/schemas/${name}` }
    }
    const out: Json = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === '$schema' || key === '$id') continue
      // Zod's safe-integer bounds are noise in an API description.
      if ((key === 'minimum' && v === -SAFE) || (key === 'maximum' && v === SAFE)) continue
      out[key] = fix(v)
    }
    return out
  }

  const components: Record<string, Json> = {}
  const shared = converted.schemas['__shared'] as { $defs?: Record<string, Json> } | undefined
  for (const [id, schema] of Object.entries(shared?.$defs ?? {}))
    components[id] = fix(schema) as Json
  // Named schemas that are themselves operation slots.
  for (const [schema, id] of slots) {
    const named = (schema as z.ZodType).meta()?.['id']
    if (typeof named === 'string' && converted.schemas[id] !== undefined)
      components[named] = fix(converted.schemas[id]) as Json
  }
  const inline = (schema: unknown): Json | undefined => {
    const id = schema === undefined || schema === 'binary' ? undefined : slots.get(schema)
    if (id === undefined) return undefined
    const named = (schema as z.ZodType).meta()?.['id']
    if (typeof named === 'string') return { $ref: `#/components/schemas/${named}` }
    return fix(converted.schemas[id]) as Json
  }
  return { components, inline }
}

/** The OpenAPI 3.1 document of the operations in `modules`. */
export function buildDocument(
  modules: readonly BlixisModule[],
  info: { title: string; version: string; description?: string },
): Json {
  const operations = [...KERNEL_OPERATIONS, ...collectOperations(modules)]
  // Requests are described as clients send them (Zod input), responses as the API returns them.
  const requests = convertSchemas(
    operations.flatMap((op) => [op.request?.query, op.request?.body]),
    'input',
  )
  const replies = convertSchemas(
    operations.flatMap((op) => Object.values(op.responses).map((r) => r.schema)),
    'output',
  )
  const paths: Record<string, Json> = {}
  for (const op of [...operations].sort((a, b) => a.route.localeCompare(b.route))) {
    const path = op.route.replace(/:(\w+)/g, '{$1}')
    const pathParams = [...op.route.matchAll(/:(\w+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }))
    const query = requests.inline(op.request?.query) as
      | { properties?: Record<string, Json>; required?: string[] }
      | undefined
    const queryParams = Object.entries(query?.properties ?? {}).map(([name, schema]) => ({
      name,
      in: 'query',
      required: query?.required?.includes(name) ?? false,
      schema,
    }))
    const headerParams = [
      ...Object.entries(op.request?.headers ?? {}).map(([name, description]) => ({
        name,
        in: 'header',
        required: false,
        description,
        schema: { type: 'string' },
      })),
      ...(op.request?.idempotent === true
        ? [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              description:
                'Makes retries of this command safe (docs/api/management-conventions.md)',
              schema: { type: 'string' },
            },
          ]
        : []),
    ]
    const body = op.request?.body
    const bodySchema = body === undefined || body === 'binary' ? undefined : requests.inline(body)
    const responses: Record<string, Json> = {}
    for (const [status, response] of Object.entries(op.responses)) {
      const schema = replies.inline(response.schema)
      responses[status] = {
        description: response.description,
        ...(schema === undefined ? {} : { content: { 'application/json': { schema } } }),
      }
    }
    for (const status of Object.keys(ERRORS))
      if (responses[status] === undefined && (status !== '401' || op.auth !== false))
        responses[status] = { $ref: `#/components/responses/${status}` }
    paths[path] = {
      ...(paths[path] ?? {}),
      [op.method.toLowerCase()]: {
        operationId: op.id,
        summary: op.summary,
        ...(op.description === undefined ? {} : { description: op.description }),
        tags: [op.tag],
        ...(op.permission === undefined ? {} : { 'x-blixis-permission': op.permission }),
        ...(op.auth === false ? { security: [] } : {}),
        ...(pathParams.length + queryParams.length + headerParams.length === 0
          ? {}
          : { parameters: [...pathParams, ...queryParams, ...headerParams] }),
        ...(body === undefined
          ? {}
          : {
              requestBody: {
                // Required when it is a file or has required properties.
                required:
                  body === 'binary' ||
                  ((bodySchema as { required?: unknown[] } | undefined)?.required?.length ?? 0) > 0,
                content:
                  body === 'binary'
                    ? {
                        'application/octet-stream': {
                          schema: { type: 'string', format: 'binary' },
                        },
                      }
                    : { 'application/json': { schema: bodySchema } },
              },
            }),
        responses,
      },
    }
  }
  const schemas = { ...requests.components, ...replies.components }
  return {
    openapi: '3.1.0',
    info,
    servers: [{ url: '/' }],
    security: [{ bearer: [] }],
    paths,
    components: {
      schemas: {
        Problem: PROBLEM,
        ...Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))),
      },
      responses: Object.fromEntries(
        Object.entries(ERRORS).map(([status, description]) => [
          status,
          {
            description,
            content: {
              'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
            },
          },
        ]),
      ),
      securitySchemes: {
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'An access token (sign-in) or an API token (`blx_pat_…`)',
        },
      },
    },
  }
}
