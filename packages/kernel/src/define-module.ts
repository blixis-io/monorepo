import type { BlixisModule, ModuleFactory } from '@blixis/contracts'

/**
 * Defines a module and returns its factory, so consumers always write `content()` in the
 * composition root — with or without options (architecture §5, §6).
 *
 * Object form, for modules without options:
 * ```ts
 * export default defineModule({ meta: { name: '@blixis/content', version: '1.0.0' } })
 * // modules: [content()]
 * ```
 *
 * Factory form, for modules with typed options:
 * ```ts
 * export default defineModule((options: { defaultTitle?: string } = {}) => ({
 *   meta: { name: '@acme/blixis-seo', version: '1.0.0' },
 *   config: options,
 * }))
 * // modules: [seo({ defaultTitle: 'Home' })]
 * ```
 *
 * The returned modules are frozen (shallowly). `defineModule` registers nothing globally.
 */
export function defineModule<TConfig = unknown>(
  module: BlixisModule<TConfig>,
): ModuleFactory<void, TConfig>
export function defineModule<TOptions, TConfig = unknown>(
  factory: (options: TOptions) => BlixisModule<TConfig>,
): (options?: TOptions) => BlixisModule<TConfig>
export function defineModule<TOptions, TConfig>(
  definition: BlixisModule<TConfig> | ((options: TOptions) => BlixisModule<TConfig>),
): () => BlixisModule<TConfig> {
  if (typeof definition === 'function') {
    return ((options?: TOptions) =>
      Object.freeze(definition((options ?? {}) as TOptions))) as () => BlixisModule<TConfig>
  }
  const frozen = Object.freeze({ ...definition })
  return () => frozen
}
