import type { GraphQLResolverMap } from '@blixis/contracts'
import { type ModuleProblem, ModuleValidationError } from '@blixis/kernel'
import { type DocumentNode, type GraphQLSchema, isObjectType, isScalarType, parse } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { SCALAR_TYPE_DEFS, SCALARS } from './scalars.ts'

/** A schema fragment and the module it comes from. */
export interface SchemaPart {
  readonly module: string
  readonly typeDefs: string | readonly string[]
  readonly resolvers?: GraphQLResolverMap<never> | undefined
}

const PLATFORM = '@blixis/graphql'
const ROOT_TYPES = ['Query', 'Mutation']

/**
 * Composes schema fragments into one executable schema (plan 012.002), reporting every problem
 * with the module that caused it: syntax errors, types defined twice, fields added twice to an
 * extended type, resolvers for fields that don't exist, and root fields without a resolver.
 * The shared scalars (`DateTime`, `Date`, `Locale`, `JSON`) are always available.
 * @throws ModuleValidationError
 */
export function composeSchema(parts: readonly SchemaPart[]): GraphQLSchema {
  const problems: ModuleProblem[] = []
  const typeOwner = new Map<string, string>()
  const fieldOwner = new Map<string, string>()
  const documents: DocumentNode[] = []
  const all: SchemaPart[] = [{ module: PLATFORM, typeDefs: SCALAR_TYPE_DEFS }, ...parts]

  for (const part of all) {
    const source = typeof part.typeDefs === 'string' ? part.typeDefs : part.typeDefs.join('\n')
    // An empty fragment (e.g. a model without types) contributes nothing; parse('') would fail.
    if (source.trim() === '' && part.resolvers === undefined) continue
    let document: DocumentNode
    try {
      document = parse(source)
    } catch (error) {
      problems.push({
        module: part.module,
        message: `invalid GraphQL SDL: ${(error as Error).message}`,
      })
      continue
    }
    documents.push(document)
    for (const definition of document.definitions) {
      if (!('name' in definition) || definition.name === undefined) continue
      const name = definition.name.value
      const isExtension = definition.kind.endsWith('Extension')
      if (!isExtension) {
        const owner = typeOwner.get(name)
        if (owner !== undefined && !(ROOT_TYPES.includes(name) && owner === part.module)) {
          problems.push({
            module: part.module,
            message: `type ${name} is already defined by ${owner}`,
          })
          continue
        }
        typeOwner.set(name, part.module)
      }
      const fields = 'fields' in definition ? (definition.fields ?? []) : []
      for (const field of fields) {
        const key = `${name}.${field.name.value}`
        const owner = fieldOwner.get(key)
        if (owner !== undefined)
          problems.push({
            module: part.module,
            message: `field ${key} is already defined by ${owner}`,
          })
        else fieldOwner.set(key, part.module)
      }
    }
  }
  if (problems.length > 0) throw new ModuleValidationError(problems)

  let schema: GraphQLSchema
  try {
    schema = createSchema({
      typeDefs: documents,
      resolvers: [
        SCALARS,
        ...all.flatMap((p) => (p.resolvers === undefined ? [] : [p.resolvers])),
      ] as never,
      // Checked below with the module named, instead of graphql-tools' anonymous error.
      resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' },
    })
  } catch (error) {
    throw new ModuleValidationError([
      { module: PLATFORM, message: `schema composition failed: ${(error as Error).message}` },
    ])
  }

  // Resolvers must match schema fields, and root fields need a resolver.
  for (const part of parts) {
    for (const [typeName, fields] of Object.entries(part.resolvers ?? {})) {
      const type = schema.getType(typeName)
      if (type === undefined) {
        problems.push({ module: part.module, message: `resolvers for unknown type ${typeName}` })
        continue
      }
      if (isScalarType(type) || !isObjectType(type)) continue
      for (const field of Object.keys(fields as object)) {
        if (type.getFields()[field] === undefined && !field.startsWith('__'))
          problems.push({
            module: part.module,
            message: `resolver ${typeName}.${field} has no field in the schema`,
          })
      }
    }
  }
  for (const rootName of ROOT_TYPES) {
    const root = schema.getType(rootName)
    if (root === undefined || !isObjectType(root)) continue
    for (const field of Object.values(root.getFields())) {
      if (field.resolve === undefined) {
        const owner = fieldOwner.get(`${rootName}.${field.name}`) ?? PLATFORM
        problems.push({ module: owner, message: `${rootName}.${field.name} has no resolver` })
      }
    }
  }
  if (problems.length > 0) throw new ModuleValidationError(problems)
  return schema
}
