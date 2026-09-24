import { type BlixisModule, type CapabilityId, isCapabilityId } from '@blixis/contracts'
import { type ModuleProblem, ModuleValidationError } from '../errors.ts'
import { parseVersion, satisfies } from './semver.ts'

/**
 * Validates the module set (§26: names, versions, required packages, capabilities, cycles) and
 * returns the modules in bootstrap order: providers before consumers, otherwise registration
 * order. Throws {@link ModuleValidationError} listing every problem.
 */
export function validateModuleGraph(input: readonly unknown[]): readonly BlixisModule[] {
  const problems: ModuleProblem[] = []
  const modules: { module: BlixisModule; index: number; name: string }[] = []

  input.forEach((candidate, index) => {
    if (typeof candidate === 'function') {
      const fn = candidate as { name?: string }
      problems.push({
        module: `module #${index}`,
        message: `a module factory${fn.name ? ` (${fn.name})` : ''} was passed instead of a module; call it: ${fn.name || 'factory'}()`,
      })
      return
    }
    const module = candidate as Partial<BlixisModule> | null
    const name = module?.meta?.name
    if (module === null || typeof module !== 'object' || typeof name !== 'string' || name === '') {
      problems.push({ module: `module #${index}`, message: 'missing meta.name' })
      return
    }
    modules.push({ module: module as BlixisModule, index, name })
  })

  const byName = new Map<string, BlixisModule>()
  for (const { module, name } of modules) {
    if (byName.has(name)) {
      problems.push({ module: name, message: 'is registered more than once (duplicate meta.name)' })
      continue
    }
    byName.set(name, module)
    if (parseVersion(module.meta.version ?? '') === undefined) {
      problems.push({
        module: name,
        message: `has an invalid meta.version "${module.meta.version}" (expected semver, e.g. 1.2.3)`,
      })
    }
  }

  const providers = new Map<CapabilityId, string[]>()
  for (const { module, name } of modules) {
    for (const capability of module.meta.capabilities ?? []) {
      if (!isCapabilityId(capability)) {
        problems.push({
          module: name,
          message: `declares an invalid capability "${capability}" (expected "<namespace>.<name>")`,
        })
        continue
      }
      providers.set(capability, [...(providers.get(capability) ?? []), name])
    }
  }

  const edges = new Map<string, Set<string>>()
  for (const { module, name } of modules) {
    const deps = new Set<string>()
    for (const [pkg, range] of Object.entries(module.meta.requires ?? {})) {
      const required = byName.get(pkg)
      if (required === undefined) {
        problems.push({
          module: name,
          message: `requires package ${pkg} (${range}), which is not registered`,
        })
        continue
      }
      const ok = satisfies(required.meta.version, range)
      if (ok === undefined) {
        problems.push({
          module: name,
          message: `has an invalid version range "${range}" for ${pkg}`,
        })
      } else if (!ok) {
        problems.push({
          module: name,
          message: `requires ${pkg}@${range}, but ${required.meta.version} is registered`,
        })
      }
      if (pkg !== name) deps.add(pkg)
    }
    for (const capability of module.meta.requiresCapabilities ?? []) {
      const provided = (providers.get(capability) ?? []).filter((p) => p !== name)
      if (provided.length === 0 && !(module.meta.capabilities ?? []).includes(capability)) {
        problems.push({
          module: name,
          message: `requires capability ${capability}, which no registered module provides`,
        })
      }
      for (const p of provided) deps.add(p)
    }
    edges.set(name, deps)
  }

  for (const cycle of findCycles(edges)) {
    problems.push({
      module: cycle[0] ?? 'blixis',
      message: `is part of a dependency cycle: ${cycle.join(' -> ')}`,
    })
  }

  if (problems.length > 0) throw new ModuleValidationError(problems)

  // Kahn's algorithm; among ready modules pick the earliest registered (stable order).
  const order: BlixisModule[] = []
  const remaining = new Map(modules.map(({ name }) => [name, new Set(edges.get(name))]))
  const indexOf = new Map(modules.map(({ name, index }) => [name, index]))
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([name]) => name)
      .sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0))
    const next = ready[0]
    if (next === undefined) break // unreachable: cycles were rejected above
    remaining.delete(next)
    for (const deps of remaining.values()) deps.delete(next)
    const module = byName.get(next)
    if (module !== undefined) order.push(module)
  }
  return order
}

function findCycles(edges: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  const cycles: string[][] = []
  const seen = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (node: string): void => {
    state.set(node, 'visiting')
    stack.push(node)
    for (const next of edges.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(next)), next]
        const key = [...cycle.slice(0, -1)].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          cycles.push(cycle)
        }
      } else if (!state.has(next)) {
        visit(next)
      }
    }
    stack.pop()
    state.set(node, 'done')
  }
  for (const node of edges.keys()) if (!state.has(node)) visit(node)
  return cycles
}
