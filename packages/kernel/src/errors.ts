import { ModuleError } from '@blixis/contracts'

/** One problem found while validating the module set, attributed to a module. */
export interface ModuleProblem {
  /** Module name (or `module #<index>` when the module has no name). */
  readonly module: string
  readonly message: string
}

/**
 * Thrown by the kernel when the module set is invalid (architecture §26). Reports **all**
 * problems at once; each line names the offending module.
 */
export class ModuleValidationError extends ModuleError {
  readonly problems: readonly ModuleProblem[]

  constructor(problems: readonly ModuleProblem[]) {
    const first = problems[0]?.module ?? 'blixis'
    const lines = problems.map((p) => `  - [${p.module}] ${p.message}`).join('\n')
    super(first, `Invalid module configuration (${problems.length} problem(s)):\n${lines}`)
    this.problems = problems
  }
}
