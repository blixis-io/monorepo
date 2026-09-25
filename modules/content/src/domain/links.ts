import type { ContentType, FieldDefinition } from './content-type.ts'
import type { EntryLink } from './entry.ts'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A link found in an entry version, with where it is (API path) and which types it may target. */
export interface LinkUsage {
  readonly link: EntryLink
  /** Path in API shape, e.g. `['fields', 'author']` or `['fields', 'body', 'en-US', 0, 'button']`. */
  readonly path: readonly (string | number)[]
  /** Allowed target content type ids from the field settings; empty allows any. */
  readonly contentTypeIds: readonly string[]
}

/**
 * Every entry and asset link in stored fields (keyed by field id): `reference` and `asset`
 * values, `link` values of kind `entry`, rich-text embeds and entry links, recursively through
 * blocks. `types` must include the environment's components.
 */
export function collectLinkUsages(
  contentType: ContentType,
  types: readonly ContentType[],
  fields: Readonly<Record<string, unknown>>,
): LinkUsage[] {
  const components = new Map(types.filter((t) => t.kind === 'component').map((t) => [t.id, t]))
  const usages: LinkUsage[] = []
  const add = (
    type: EntryLink['type'],
    id: unknown,
    path: (string | number)[],
    allowed: unknown = [],
  ) => {
    if (typeof id === 'string' && UUID.test(id))
      usages.push({
        link: { type, id },
        path,
        contentTypeIds: Array.isArray(allowed)
          ? allowed.filter((x): x is string => typeof x === 'string')
          : [],
      })
  }

  function value(field: FieldDefinition, v: unknown, path: (string | number)[]): void {
    const allowed = field.settings['contentTypeIds']
    switch (field.type) {
      case 'reference':
      case 'asset': {
        const items: [unknown, (string | number)[]][] = Array.isArray(v)
          ? v.map((item, i) => [item, [...path, i]])
          : [[v, path]]
        for (const [item, at] of items)
          if (isObject(item))
            add(item['type'] === 'asset' ? 'asset' : 'entry', item['id'], at, allowed)
        return
      }
      case 'link':
        if (isObject(v) && v['kind'] === 'entry') add('entry', v['id'], path, allowed)
        return
      case 'richText':
        richText(v, path)
        return
      case 'blocks':
        if (!Array.isArray(v)) return
        v.forEach((block, i) => {
          if (!isObject(block)) return
          const component = components.get(String(block['_type']))
          if (component !== undefined) object(component.fields, block, false, [...path, i])
        })
        return
    }
  }

  function richText(node: unknown, path: (string | number)[]): void {
    if (!isObject(node)) return
    if (node['type'] === 'embeddedEntry' && isObject(node['attrs']))
      add('entry', node['attrs']['id'], path)
    if (node['type'] === 'embeddedAsset' && isObject(node['attrs']))
      add('asset', node['attrs']['id'], path)
    if (Array.isArray(node['marks']))
      for (const mark of node['marks'])
        if (isObject(mark) && mark['type'] === 'link' && isObject(mark['attrs']))
          add('entry', mark['attrs']['entryId'], path)
    if (Array.isArray(node['content'])) for (const child of node['content']) richText(child, path)
  }

  function object(
    defs: readonly FieldDefinition[],
    values: Readonly<Record<string, unknown>>,
    localizable: boolean,
    path: (string | number)[],
  ) {
    for (const field of defs) {
      if (field.disabled || !(field.id in values)) continue
      const v = values[field.id]
      const at = [...path, field.apiId]
      if (localizable && field.localized && isObject(v))
        for (const [locale, perLocale] of Object.entries(v))
          value(field, perLocale, [...at, locale])
      else value(field, v, at)
    }
  }

  object(contentType.fields, fields, true, ['fields'])
  return usages
}

/** The links of stored fields (see {@link collectLinkUsages}). */
export function collectLinks(
  contentType: ContentType,
  types: readonly ContentType[],
  fields: Readonly<Record<string, unknown>>,
): EntryLink[] {
  return collectLinkUsages(contentType, types, fields).map((u) => u.link)
}
