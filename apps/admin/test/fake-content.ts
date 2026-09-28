import type { Asset, ContentType, Entry, EntryVersion } from '@blixis-io/sdk'

const stamp = '2026-01-01T00:00:00.000Z'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

type Problem = (status: number, code: string, detail: string, requestId?: string) => Response

/**
 * Entries, versions, publishing, and assets for the fake API. Publishing checks `required` fields
 * (per default locale for localized ones) and that linked entries are published, like the server.
 */
export function createContentFake(options: {
  contentTypes: ContentType[]
  problem: Problem
  defaultLocale: () => string
}) {
  const { contentTypes, problem } = options
  const entries: Entry[] = []
  const versions = new Map<string, EntryVersion[]>()
  const assets: Asset[] = []
  const bodies: { method: string; path: string; body: unknown }[] = []
  let counter = 0
  let referrersBlockUnpublish = false

  const typeOf = (entry: Entry) => contentTypes.find((t) => t.id === entry.sys.contentType.id)

  function addVersion(entry: Entry, restoredFrom: string | null = null) {
    const list = versions.get(entry.sys.id) ?? []
    for (const v of list) v.sys.isCurrent = false
    list.unshift({
      sys: {
        id: uuid(++counter),
        entryId: entry.sys.id,
        number: entry.sys.version,
        contentTypeVersion: 1,
        restoredFrom,
        isCurrent: true,
        isPublished: false,
        createdAt: stamp,
        createdBy: 'u1',
      },
      fields: structuredClone(entry.fields),
    })
    versions.set(entry.sys.id, list)
  }

  function save(entry: Entry, fields: Record<string, unknown>) {
    const next: Entry = {
      sys: {
        ...entry.sys,
        version: entry.sys.version + 1,
        fieldsVersion: entry.sys.version + 1,
        status: entry.sys.status === 'draft' ? 'draft' : 'changed',
      },
      fields,
    }
    entries.splice(entries.indexOf(entry), 1, next)
    addVersion(next)
    return next
  }

  /** The issues the server would report on publish (a subset of its checks). */
  function publishIssues(entry: Entry) {
    const type = typeOf(entry)
    const issues: { path: (string | number)[]; message: string }[] = []
    for (const field of type?.fields ?? []) {
      const raw = entry.fields[field.apiId]
      const value = field.localized
        ? (raw as Record<string, unknown> | undefined)?.[options.defaultLocale()]
        : raw
      if (field.required && (value === undefined || value === ''))
        issues.push({
          path: ['fields', field.apiId, ...(field.localized ? [options.defaultLocale()] : [])],
          message: 'Required',
        })
      if (field.type === 'reference' && value !== undefined) {
        const links = Array.isArray(value) ? value : [value]
        for (const [i, link] of links.entries()) {
          const target = entries.find((e) => e.sys.id === (link as { id: string }).id)
          if (target?.sys.status === 'draft' || target === undefined)
            issues.push({
              path: ['fields', field.apiId, ...(Array.isArray(value) ? [i] : [])],
              message: 'The linked entry is not published',
            })
        }
      }
    }
    return issues
  }

  async function handle(request: Request, path: string): Promise<Response | undefined> {
    const body =
      request.method === 'GET' || request.method === 'DELETE'
        ? undefined
        : await request.clone().text()
    let match = path.match(/^\/spaces\/([^/]+)\/entries$/)
    if (match !== null) {
      if (request.method === 'GET') {
        const url = new URL(request.url)
        const typeFilter = url.searchParams.get('contentType')
        const list = entries.filter(
          (e) =>
            typeFilter === null ||
            e.sys.contentType.apiId === typeFilter ||
            e.sys.contentType.id === typeFilter,
        )
        return Response.json({ entries: list, nextCursor: null })
      }
      const input = JSON.parse(body ?? '{}') as {
        contentType: string
        fields?: Record<string, unknown>
      }
      bodies.push({ method: 'POST', path, body: input })
      const type = contentTypes.find(
        (t) => t.apiId === input.contentType || t.id === input.contentType,
      )
      if (type === undefined) return problem(400, 'VALIDATION_FAILED', 'Unknown content type')
      const entry: Entry = {
        sys: {
          id: uuid(++counter),
          type: 'entry',
          contentType: { id: type.id, apiId: type.apiId },
          environmentId: 'env',
          version: 1,
          fieldsVersion: 1,
          status: 'draft',
          publishedVersionId: null,
          publishedAt: null,
          firstPublishedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: 'u1',
          updatedBy: 'u1',
        },
        fields: input.fields ?? {},
      }
      entries.unshift(entry)
      addVersion(entry)
      return Response.json(entry, { status: 201 })
    }
    match = path.match(/^\/entries\/([^/]+)(\/[a-z]+)?(?:\/([^/]+)\/restore)?$/)
    if (match !== null) {
      const entry = entries.find((e) => e.sys.id === match?.[1])
      if (entry === undefined) return problem(404, 'NOT_FOUND', 'Entry not found', 'req-404')
      const action = match[2]
      const ifMatch = request.headers.get('if-match')?.replaceAll('"', '')
      const stale = () =>
        problem(
          409,
          'CONFLICT',
          `The entry changed since you loaded it (now version ${entry.sys.version}): reload and retry`,
          'req-stale',
        )
      if (ifMatch !== undefined && Number(ifMatch) !== entry.sys.version) return stale()
      if (action === undefined && request.method === 'GET') return Response.json(entry)
      if (action === undefined && request.method === 'PATCH') {
        const input = JSON.parse(body ?? '{}') as { fields: Record<string, unknown> }
        bodies.push({ method: 'PATCH', path, body: input })
        return Response.json(save(entry, input.fields))
      }
      if (action === undefined && request.method === 'DELETE') {
        entries.splice(entries.indexOf(entry), 1)
        return new Response(null, { status: 204 })
      }
      if (action === '/versions' && match[3] === undefined)
        return Response.json({ versions: versions.get(entry.sys.id) ?? [], nextBefore: null })
      if (action === '/publish') {
        const issues = publishIssues(entry)
        if (issues.length > 0)
          return Response.json(
            {
              type: 'about:blank',
              title: 'VALIDATION_FAILED',
              status: 400,
              code: 'VALIDATION_FAILED',
              detail: 'The entry cannot be published',
              requestId: 'req-publish',
              errors: issues,
            },
            { status: 400 },
          )
        const current = versions.get(entry.sys.id)?.[0]
        for (const v of versions.get(entry.sys.id) ?? []) v.sys.isPublished = v === current
        const next: Entry = {
          ...entry,
          sys: {
            ...entry.sys,
            status: 'published',
            publishedVersionId: current?.sys.id ?? null,
            publishedAt: stamp,
          },
        }
        entries.splice(entries.indexOf(entry), 1, next)
        return Response.json(next)
      }
      if (action === '/unpublish') {
        const input = JSON.parse(body || '{}') as { force?: boolean }
        if (referrersBlockUnpublish && input.force !== true)
          return problem(
            409,
            'CONFLICT',
            `Published entries link to this entry (${uuid(999)}): unpublish or change them first, or unpublish with force`,
            'req-ref',
          )
        const next: Entry = {
          ...entry,
          sys: { ...entry.sys, status: 'draft', publishedVersionId: null, publishedAt: null },
        }
        entries.splice(entries.indexOf(entry), 1, next)
        return Response.json(next)
      }
      if (match[3] !== undefined) {
        const version = versions.get(entry.sys.id)?.find((v) => v.sys.id === match?.[3])
        if (version === undefined) return problem(404, 'NOT_FOUND', 'Version not found')
        const restored = save(entry, structuredClone(version.fields))
        const list = versions.get(entry.sys.id)
        if (list?.[0] !== undefined) list[0].sys.restoredFrom = version.sys.id
        return Response.json(restored)
      }
    }
    match = path.match(/^\/spaces\/([^/]+)\/assets$/)
    if (match !== null) {
      if (request.method === 'GET') return Response.json({ assets, nextCursor: null })
      const filename = decodeURIComponent(
        request.headers.get('content-disposition')?.split("''")[1] ?? 'file',
      )
      const asset: Asset = {
        sys: {
          id: uuid(++counter),
          type: 'asset',
          environmentId: 'env',
          version: 1,
          status: 'draft',
          publishedAt: null,
          firstPublishedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: 'u1',
          updatedBy: 'u1',
        },
        fields: {
          filename,
          title: {},
          description: {},
          mimeType: request.headers.get('content-type') ?? '',
          size: Number(request.headers.get('content-length') ?? 0),
          sha256: null,
          width: null,
          height: null,
          url: `/assets/s1/${counter}/f/${filename}`,
        },
      }
      assets.unshift(asset)
      return Response.json(asset, { status: 201 })
    }
    match = path.match(/^\/assets\/([^/]+)(\/publish)?$/)
    if (match !== null) {
      const asset = assets.find((a) => a.sys.id === match?.[1])
      if (asset === undefined) return problem(404, 'NOT_FOUND', 'Asset not found')
      if (match[2] === '/publish') {
        const published: Asset = { ...asset, sys: { ...asset.sys, status: 'published' } }
        assets.splice(assets.indexOf(asset), 1, published)
        return Response.json(published)
      }
      return Response.json(asset)
    }
    return undefined
  }

  return {
    handle,
    entries,
    versions,
    assets,
    /** Bodies of entry creates and updates, in order. */
    bodies,
    /** Someone else saves the entry. */
    bumpEntry(id: string) {
      const entry = entries.find((e) => e.sys.id === id)
      if (entry !== undefined) save(entry, entry.fields as Record<string, unknown>)
    },
    setReferrersBlockUnpublish(value: boolean) {
      referrersBlockUnpublish = value
    },
    seedEntry(
      type: ContentType,
      fields: Record<string, unknown>,
      status: Entry['sys']['status'] = 'draft',
    ) {
      const entry: Entry = {
        sys: {
          id: uuid(++counter),
          type: 'entry',
          contentType: { id: type.id, apiId: type.apiId },
          environmentId: 'env',
          version: 1,
          fieldsVersion: 1,
          status,
          publishedVersionId: null,
          publishedAt: null,
          firstPublishedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: 'u1',
          updatedBy: 'u1',
        },
        fields,
      }
      entries.push(entry)
      addVersion(entry)
      return entry
    },
    seedAsset(filename: string, mimeType: string) {
      const asset: Asset = {
        sys: {
          id: uuid(++counter),
          type: 'asset',
          environmentId: 'env',
          version: 1,
          status: 'published',
          publishedAt: stamp,
          firstPublishedAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
          createdBy: 'u1',
          updatedBy: 'u1',
        },
        fields: {
          filename,
          title: {},
          description: {},
          mimeType,
          size: 10,
          sha256: null,
          width: null,
          height: null,
          url: `/assets/s1/${counter}/f/${filename}`,
        },
      }
      assets.push(asset)
      return asset
    },
  }
}
