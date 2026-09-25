import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql'

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const LOCALE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/

function stringScalar(name: string, description: string, check: (value: string) => boolean) {
  const parse = (value: unknown) => {
    if (typeof value !== 'string' || !check(value))
      throw new GraphQLError(`Invalid ${name}: ${JSON.stringify(value)}`)
    return value
  }
  return new GraphQLScalarType({
    name,
    description,
    serialize: parse,
    parseValue: parse,
    parseLiteral: (ast) => {
      if (ast.kind !== Kind.STRING) throw new GraphQLError(`${name} must be a string`)
      return parse(ast.value)
    },
  })
}

function literal(ast: ValueNode, variables?: Record<string, unknown> | null): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
    case Kind.ENUM:
      return ast.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value)
    case Kind.NULL:
      return null
    case Kind.LIST:
      return ast.values.map((v) => literal(v, variables))
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((f) => [f.name.value, literal(f.value, variables)]))
    case Kind.VARIABLE:
      return variables?.[ast.name.value]
  }
}

/** Shared scalars every module can use in its SDL without declaring them (plan 012.002). */
export const SCALARS = {
  DateTime: stringScalar(
    'DateTime',
    'ISO 8601 date and time with offset, e.g. 2026-09-25T14:30:00.000Z.',
    (v) => DATE_TIME.test(v) && !Number.isNaN(Date.parse(v)),
  ),
  Date: stringScalar(
    'Date',
    'Calendar date YYYY-MM-DD.',
    (v) => DATE.test(v) && !Number.isNaN(Date.parse(v)),
  ),
  Locale: stringScalar('Locale', 'BCP 47 locale code, e.g. en-US or nl-NL.', (v) => LOCALE.test(v)),
  JSON: new GraphQLScalarType({
    name: 'JSON',
    description: 'Any JSON value.',
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast, variables) => literal(ast, variables),
  }),
} as const

/** SDL declaring the shared scalars. */
export const SCALAR_TYPE_DEFS = Object.keys(SCALARS)
  .map((name) => `scalar ${name}`)
  .join('\n')
