import { type EventDefinition, ModuleError } from '@blixis/contracts'

const key = (type: string, version: number) => `${type}@${version}`

/**
 * Known event definitions by `type` + `version` (architecture §15). Two modules may use the
 * same definition (e.g. the emitter and a subscriber import the same `defineEvent` result);
 * two *different* definitions for the same type and version are a conflict.
 */
export class EventRegistry {
  readonly #definitions = new Map<string, { definition: EventDefinition; module: string }>()

  /**
   * Registers `definition` on behalf of `module`.
   * @throws ModuleError when another module registered a different definition for the same
   * type and version.
   */
  register(definition: EventDefinition, module: string): void {
    const id = key(definition.type, definition.version)
    const existing = this.#definitions.get(id)
    if (existing === undefined) {
      this.#definitions.set(id, { definition, module })
      return
    }
    if (existing.definition !== definition) {
      throw new ModuleError(
        module,
        `defines event ${id} differently from ${existing.module}; import the same definition`,
      )
    }
  }

  /** The definition for `type` + `version`, if registered. */
  get(type: string, version: number): EventDefinition | undefined {
    return this.#definitions.get(key(type, version))?.definition
  }

  /** All registered definitions, e.g. for generated event docs. */
  list(): readonly EventDefinition[] {
    return [...this.#definitions.values()].map((entry) => entry.definition)
  }
}
