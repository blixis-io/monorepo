import type { ContentType, FieldDefinition } from './content-type.ts'
import type { EntryLink } from './entry.ts'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Every entry and asset link in stored fields (keyed by field id): `reference` and `asset`
 * values, `link` values of kind `entry`, rich-text embeds and entry links, recursively through
 * blocks. `types` must include the environment's components.
 */
export function collectLinks(
  contentType: ContentType,
  types: readonly ContentType[],
  fields: Readonly<Record<string, unknown>>,
): EntryLink[] {
  const components = new Map(types.filter((t) => t.kind === 'component').map((t) => [t.id, t]))
  const links: EntryLink[] = []
  const add = (type: EntryLink['type'], id: unknown) => {
    if (typeof id === 'string' && UUID.test(id)) links.push({ type, id })
  }

  function value(field: FieldDefinition, v: unknown): void {
    const items = Array.isArray(v) ? v : [v]
    switch (field.type) {
      case 'reference':
      case 'asset':
        for (const item of items)
          if (isObject(item)) add(item['type'] === 'asset' ? 'asset' : 'entry', item['id'])
        return
      case 'link':
        if (isObject(v) && v['kind'] === 'entry') add('entry', v['id'])
        return
      case 'richText':
        richText(v)
        return
      case 'blocks':
        for (const block of items) {
          if (!isObject(block)) continue
          const component = components.get(String(block['_type']))
          if (component !== undefined) object(component.fields, block, false)
        }
        return
    }
  }

  function richText(node: unknown): void {
    if (!isObject(node)) return
    if (node['type'] === 'embeddedEntry' && isObject(node['attrs']))
      add('entry', node['attrs']['id'])
    if (node['type'] === 'embeddedAsset' && isObject(node['attrs']))
      add('asset', node['attrs']['id'])
    if (Array.isArray(node['marks']))
      for (const mark of node['marks'])
        if (isObject(mark) && mark['type'] === 'link' && isObject(mark['attrs']))
          add('entry', mark['attrs']['entryId'])
    if (Array.isArray(node['content'])) for (const child of node['content']) richText(child)
  }

  function object(
    defs: readonly FieldDefinition[],
    values: Readonly<Record<string, unknown>>,
    localizable: boolean,
  ) {
    for (const field of defs) {
      if (field.disabled || !(field.id in values)) continue
      const v = values[field.id]
      if (localizable && field.localized && isObject(v))
        for (const perLocale of Object.values(v)) value(field, perLocale)
      else value(field, v)
    }
  }

  object(contentType.fields, fields, true)
  return links
}
