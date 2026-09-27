/**
 * A small JSON Schema → TypeScript emitter for the SDK (ADR 0015). TypeScript 7 has no compiler
 * API, so off-the-shelf OpenAPI generators that print code with it don't run; this covers the
 * subset the Blixis document uses.
 */

type Json = Record<string, unknown>
type Schema = Json | boolean

const IDENT = /^[A-Za-z_$][\w$]*$/
const key = (name: string) => (IDENT.test(name) ? name : JSON.stringify(name))
const doc = (text: unknown, indent: string) =>
  typeof text === 'string' && text !== ''
    ? `${indent}/** ${text.replace(/\*\//g, '*\\/').replace(/\n/g, ' ')} */\n`
    : ''

/** The TypeScript type of a JSON Schema. */
export function tsType(schema: Schema | undefined, indent = ''): string {
  if (schema === undefined || schema === true) return 'unknown'
  if (schema === false) return 'never'
  const s = schema
  if (typeof s['$ref'] === 'string') return (s['$ref'] as string).split('/').at(-1) ?? 'unknown'
  if (s['const'] !== undefined) return JSON.stringify(s['const'])
  if (Array.isArray(s['enum']))
    return (s['enum'] as unknown[]).map((v) => JSON.stringify(v)).join(' | ')
  for (const combinator of ['anyOf', 'oneOf'] as const)
    if (Array.isArray(s[combinator]))
      return (s[combinator] as Schema[]).map((part) => wrap(tsType(part, indent))).join(' | ')
  if (Array.isArray(s['allOf']))
    return (s['allOf'] as Schema[]).map((part) => wrap(tsType(part, indent))).join(' & ')
  const types = Array.isArray(s['type'])
    ? (s['type'] as string[])
    : typeof s['type'] === 'string'
      ? [s['type'] as string]
      : []
  if (types.length > 1) return types.map((type) => wrap(tsType({ ...s, type }, indent))).join(' | ')
  switch (types[0]) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      return `${wrap(tsType(s['items'] as Schema | undefined, indent))}[]`
    case 'object':
      return objectType(s, indent)
    default:
      return s['properties'] !== undefined ? objectType(s, indent) : 'unknown'
  }
}

const wrap = (type: string) => (/[|&]/.test(type) && !type.startsWith('{') ? `(${type})` : type)

function objectType(s: Json, indent: string): string {
  const properties = (s['properties'] ?? {}) as Record<string, Schema>
  const required = new Set((s['required'] ?? []) as string[])
  const extra = s['additionalProperties'] as Schema | undefined
  const entries = Object.entries(properties)
  const record =
    extra === undefined || extra === false ? undefined : `Record<string, ${tsType(extra, indent)}>`
  if (entries.length === 0) return record ?? 'Record<string, never>'
  const inner = `${indent}  `
  const body = entries
    .map(([name, schema]) => {
      const optional = !required.has(name)
      const description = typeof schema === 'object' ? schema['description'] : undefined
      // `| undefined` keeps optional properties usable under exactOptionalPropertyTypes.
      const type = `${tsType(schema, inner)}${optional ? ' | undefined' : ''}`
      return `${doc(description, inner)}${inner}${key(name)}${optional ? '?' : ''}: ${type}`
    })
    .join('\n')
  const object = `{\n${body}\n${indent}}`
  return record === undefined ? object : `${object} & ${record}`
}

interface Operation {
  operationId: string
  summary?: string
  parameters?: {
    name: string
    in: string
    required?: boolean
    schema?: Schema
    description?: string
  }[]
  requestBody?: { required?: boolean; content: Record<string, { schema?: Schema }> }
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>
  'x-blixis-permission'?: string
  security?: unknown[]
}

/** TypeScript source for the SDK: named schemas, an `Operations` map, and a route table. */
export function emitSdkTypes(document: Json): string {
  const components = ((document['components'] as Json)['schemas'] ?? {}) as Record<string, Json>
  const out: string[] = [
    '// Generated from apps/api/openapi.json by `pnpm openapi:generate` (ADR 0015). Do not edit.',
    '/* biome-ignore-all lint: generated */',
    '',
  ]
  for (const [name, schema] of Object.entries(components)) {
    out.push(`${doc(schema['description'], '')}export type ${name} = ${tsType(schema)}`, '')
  }
  const operations: [string, string, string, Operation][] = []
  for (const [path, methods] of Object.entries(
    document['paths'] as Record<string, Record<string, Operation>>,
  ))
    for (const [method, operation] of Object.entries(methods))
      operations.push([operation.operationId, method.toUpperCase(), path, operation])
  operations.sort(([a], [b]) => a.localeCompare(b))

  out.push(
    '/** Every Management API operation by `operationId`: its inputs and its success response. */',
  )
  out.push('export interface Operations {')
  for (const [id, method, path, op] of operations) {
    const params = (op.parameters ?? []).filter((p) => p.in === 'path')
    const query = (op.parameters ?? []).filter((p) => p.in === 'query')
    const json = op.requestBody?.content['application/json']?.schema
    const binary = op.requestBody?.content['application/octet-stream'] !== undefined
    const success = Object.entries(op.responses).find(([status]) => /^2\d\d$/.test(status))
    const response = success?.[1].content?.['application/json']?.schema
    const fields = (list: typeof params) =>
      list.length === 0
        ? 'Record<string, never>'
        : `{ ${list
            .map((p) => {
              const type = p.in === 'path' ? 'string' : tsType(p.schema, '      ')
              return `${key(p.name)}${p.required ? '' : '?'}: ${type}${p.required ? '' : ' | undefined'}`
            })
            .join('; ')} }`
    out.push(`${doc(`${method} ${path} — ${op.summary ?? ''}`, '  ')}  ${key(id)}: {`)
    out.push(`    params: ${fields(params)}`)
    out.push(`    query: ${fields(query)}`)
    out.push(
      `    body: ${binary ? 'BinaryBody' : json === undefined ? 'undefined' : tsType(json, '    ')}`,
    )
    out.push(`    response: ${response === undefined ? 'undefined' : tsType(response, '    ')}`)
    out.push('  }')
  }
  out.push('}', '')
  out.push('/** A raw file body for uploads. */')
  out.push(
    'export type BinaryBody = Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>',
    '',
  )
  out.push('/** How an operation is called. */')
  out.push(
    "export interface Route { readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; readonly path: string; readonly body: 'none' | 'json' | 'binary'; readonly auth?: false; readonly idempotent?: true }",
    '',
  )
  out.push('/** How to call each operation (method, path template, body kind). */')
  out.push('export const ROUTES = {')
  for (const [id, method, path, op] of operations) {
    const body =
      op.requestBody === undefined
        ? 'none'
        : op.requestBody.content['application/octet-stream'] !== undefined
          ? 'binary'
          : 'json'
    const auth = op.security !== undefined && op.security.length === 0 ? ', auth: false' : ''
    const idempotent = (op.parameters ?? []).some(
      (p) => p.in === 'header' && p.name === 'Idempotency-Key',
    )
      ? ', idempotent: true'
      : ''
    out.push(
      `  ${key(id)}: { method: '${method}', path: '${path}', body: '${body}'${auth}${idempotent} },`,
    )
  }
  out.push('} as const satisfies Record<keyof Operations, Route>', '')
  return out.join('\n')
}
