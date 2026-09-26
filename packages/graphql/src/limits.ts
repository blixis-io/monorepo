import {
  type ASTVisitor,
  type FieldNode,
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  NoSchemaIntrospectionCustomRule,
  parse,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql'
import type { Plugin } from 'graphql-yoga'
import type { GraphQLContext } from './context.ts'

/** Query limits of the delivery API (plan 012.008). Defaults protect a Worker's CPU budget. */
export interface GraphqlLimits {
  /** Deepest nesting of fields. Default 12. */
  readonly maxDepth?: number
  /** Aliases per operation. Default 30. */
  readonly maxAliases?: number
  /** Lexical tokens per document (checked while parsing). Default 3000. */
  readonly maxTokens?: number
  /**
   * Estimated result size: every field costs 1, multiplied by the `limit` of each enclosing list
   * field (default 25 for fields without one, 100 when `limit` is a variable). Default 20 000.
   */
  readonly maxCost?: number
  /** Request body size in bytes. Default 64 KiB. */
  readonly maxBodyBytes?: number
  /**
   * Whether introspection is allowed: `true`, `false`, or `'members'` (users and API tokens only).
   * Default: `'members'` where the Worker's `BLIXIS_ENV` is `production`, else `true`.
   */
  readonly introspection?: boolean | 'members'
}

export const DEFAULT_LIMITS = {
  maxDepth: 12,
  maxAliases: 30,
  maxTokens: 3000,
  maxCost: 20_000,
  maxBodyBytes: 64 * 1024,
} as const

const LIST_DEFAULT = 25
const VARIABLE_LIMIT = 100

interface Measure {
  depth: number
  aliases: number
  cost: number
}

/** Depth, aliases and cost of a selection set, following fragments once per path. */
function measure(
  selectionSet: SelectionSetNode,
  fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  seen: ReadonlySet<string> = new Set(),
): Measure {
  let depth = 0
  let aliases = 0
  let cost = 0
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.alias !== undefined) aliases++
      const child =
        selection.selectionSet === undefined
          ? undefined
          : measure(selection.selectionSet, fragments, seen)
      depth = Math.max(depth, 1 + (child?.depth ?? 0))
      aliases += child?.aliases ?? 0
      cost += 1 + (child === undefined ? 0 : child.cost * multiplier(selection))
    } else {
      const set =
        selection.kind === Kind.INLINE_FRAGMENT
          ? selection.selectionSet
          : seen.has(selection.name.value)
            ? undefined
            : fragments.get(selection.name.value)?.selectionSet
      if (set === undefined) continue
      const nested =
        selection.kind === Kind.FRAGMENT_SPREAD ? new Set([...seen, selection.name.value]) : seen
      const child = measure(set, fragments, nested)
      depth = Math.max(depth, child.depth)
      aliases += child.aliases
      cost += child.cost
    }
  }
  return { depth, aliases, cost }
}

/** How many items a field may return: its `limit` argument, or a default for collections. */
function multiplier(field: FieldNode): number {
  const limit = field.arguments?.find((a) => a.name.value === 'limit')?.value
  if (limit?.kind === Kind.INT) return Math.max(1, Number(limit.value))
  if (limit?.kind === Kind.VARIABLE) return VARIABLE_LIMIT
  const name = field.name.value
  // A collection's `items` is the same list the collection field already counted.
  return name.endsWith('Collection') || name === 'entries' ? LIST_DEFAULT : 1
}

function limitsRule(
  limits: Required<Omit<GraphqlLimits, 'introspection' | 'maxTokens' | 'maxBodyBytes'>>,
): ValidationRule {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map(
      context
        .getDocument()
        .definitions.filter((d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION)
        .map((d) => [d.name.value, d]),
    )
    return {
      OperationDefinition(node) {
        const m = measure(node.selectionSet, fragments)
        const fail = (message: string) =>
          context.reportError(
            new GraphQLError(message, { nodes: [node], extensions: { code: 'QUERY_TOO_COMPLEX' } }),
          )
        if (m.depth > limits.maxDepth)
          fail(`Query is nested ${m.depth} levels deep; the limit is ${limits.maxDepth}`)
        if (m.aliases > limits.maxAliases)
          fail(`Query uses ${m.aliases} aliases; the limit is ${limits.maxAliases}`)
        if (m.cost > limits.maxCost)
          fail(
            `Query may return about ${m.cost} fields; the limit is ${limits.maxCost}. Lower collection limits or select fewer fields`,
          )
      },
    }
  }
}

/** Yoga plugin enforcing {@link GraphqlLimits} while parsing and validating. */
export function useLimits(
  options: GraphqlLimits = {},
): Plugin<GraphQLContext & { env?: Readonly<Record<string, unknown>> }> {
  const limits = { ...DEFAULT_LIMITS, ...options }
  const rule = limitsRule(limits)
  return {
    onParse({ setParseFn }) {
      setParseFn((source, parseOptions) =>
        parse(source, { ...parseOptions, maxTokens: limits.maxTokens }),
      )
    },
    onValidate({ addValidationRule, context }) {
      addValidationRule(rule)
      const production = context.env?.['BLIXIS_ENV'] === 'production'
      const introspection = options.introspection ?? (production ? 'members' : true)
      const actor = context.requestContext.actor.type
      const member = actor === 'user' || actor === 'apiToken'
      if (introspection === false || (introspection === 'members' && !member))
        addValidationRule(NoSchemaIntrospectionCustomRule)
    },
  }
}
