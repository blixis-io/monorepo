import type { ContentType, Organization, Space, User, UserPreferences } from '@blixis-io/sdk'
import { createContentFake } from './fake-content.ts'
import fieldTypes from './fixtures/field-types.json' with { type: 'json' }

const stamp = '2026-01-01T00:00:00.000Z'
export const PASSWORD = 'correct horse battery'
export const USER: User = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  status: 'active',
  createdAt: stamp,
  updatedAt: stamp,
}

const problem = (status: number, code: string, detail: string, requestId = 'req-test-1') =>
  Response.json({ type: 'about:blank', title: code, status, code, detail, requestId }, { status })

/**
 * An in-memory Management API for component tests: sign-in with a cookie jar, organizations,
 * spaces. Only what the admin shell calls; everything else answers 404.
 */
export function createFakeApi(options: { signedIn?: boolean; locales?: string[] } = {}) {
  const localeCodes = options.locales ?? ['en-US']
  let cookie: string | undefined = options.signedIn ? 'rt-0' : undefined
  let issued = 0
  const live = new Set<string>()
  const organizations: Organization[] = [
    { id: 'o1', name: 'Acme', slug: 'acme', createdAt: stamp, updatedAt: stamp },
  ]
  const spaces: Space[] = [
    {
      id: 's1',
      organizationId: 'o1',
      name: 'Marketing site',
      slug: 'marketing',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 's2',
      organizationId: 'o1',
      name: 'Docs',
      slug: 'docs',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
  const calls: string[] = []
  let preferences: UserPreferences = { colorScheme: 'system', theme: null }
  const contentTypes: ContentType[] = []
  const contentTypeBodies: unknown[] = []
  let unsafeChange: string | undefined
  let fieldCounter = 0
  const content = createContentFake({
    contentTypes,
    problem: (status, code, detail, requestId) => problem(status, code, detail, requestId),
    defaultLocale: () => localeCodes[0] ?? 'en-US',
  })
  let failNext: Response | undefined

  const session = () => {
    issued++
    cookie = `rt-${issued}`
    live.add(`at-${issued}`)
    return Response.json({
      tokenType: 'Bearer',
      accessToken: `at-${issued}`,
      expiresIn: 900,
      user: USER,
    })
  }
  const details = (space: Space) => ({
    ...space,
    environments: [
      {
        id: `${space.id}-env`,
        organizationId: space.organizationId,
        spaceId: space.id,
        key: 'main',
        isDefault: true,
        createdAt: stamp,
      },
    ],
    locales: localeCodes.map((code, index) => ({
      id: `${space.id}-loc-${code}`,
      organizationId: space.organizationId,
      spaceId: space.id,
      code,
      name: code,
      isDefault: index === 0,
      fallbackCode: null,
      createdAt: stamp,
    })),
  })

  type FieldInput = Partial<ContentType['fields'][number]> & {
    apiId: string
    name: string
    type: string
  }
  const toFields = (inputs: FieldInput[] | undefined) =>
    (inputs ?? []).map((f) => ({
      id: f.id ?? `fld${String(++fieldCounter).padStart(5, '0')}`,
      apiId: f.apiId,
      name: f.name,
      type: f.type,
      required: f.required ?? false,
      localized: f.localized ?? false,
      disabled: f.disabled ?? false,
      settings: f.settings ?? {},
      ...(f.description === undefined ? {} : { description: f.description }),
      ...(f.group === undefined ? {} : { group: f.group }),
      ...(f.hidden === undefined ? {} : { hidden: f.hidden }),
      ...(f.showWhen === undefined ? {} : { showWhen: f.showWhen }),
    }))
  /** Mirrors a few server checks so the editor's error paths can be exercised. */
  const fieldIssues = (fields: FieldInput[]) =>
    fields.flatMap((f, index) => [
      ...(fields.findIndex((o) => o.apiId === f.apiId) !== index
        ? [{ path: ['fields', index, 'apiId'], message: `Duplicate field apiId "${f.apiId}"` }]
        : []),
      ...(f.type === 'blocks' && !Array.isArray(f.settings?.['componentIds'])
        ? [{ path: ['fields', index, 'settings', 'componentIds'], message: 'Required' }]
        : []),
    ])

  async function contentTypeRoute(request: Request, id: string | undefined): Promise<Response> {
    const found = contentTypes.find((t) => t.id === id)
    if (request.method === 'GET' && id === undefined) return Response.json({ contentTypes })
    if (request.method === 'GET')
      return found === undefined
        ? problem(404, 'NOT_FOUND', 'Content type not found', 'req-404')
        : Response.json(found)
    if (request.method === 'POST') {
      const body = (await request.json()) as {
        apiId: string
        name: string
        kind?: ContentType['kind']
      }
      if (contentTypes.some((t) => t.apiId === body.apiId))
        return problem(
          409,
          'CONFLICT',
          'Another content type or component in this environment uses this apiId',
          'req-dup',
        )
      const type: ContentType = {
        id: `ct-${contentTypes.length + 1}`,
        environmentId: 'env',
        kind: body.kind ?? 'entry',
        apiId: body.apiId,
        name: body.name,
        description: '',
        displayField: null,
        groups: [],
        fields: [],
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
      }
      contentTypes.push(type)
      return Response.json(type, { status: 201 })
    }
    if (found === undefined) return problem(404, 'NOT_FOUND', 'Content type not found', 'req-404')
    if (request.method === 'DELETE') {
      contentTypes.splice(contentTypes.indexOf(found), 1)
      return new Response(null, { status: 204 })
    }
    const body = (await request.json()) as Partial<ContentType> & {
      version: number
      fields?: FieldInput[]
    }
    contentTypeBodies.push(body)
    if (body.version !== found.version)
      return problem(
        409,
        'CONFLICT',
        `The content type changed since you loaded it (now version ${found.version}): reload and retry`,
        'req-stale',
      )
    const issues = fieldIssues(body.fields ?? [])
    if (issues.length > 0)
      return Response.json(
        {
          type: 'about:blank',
          title: 'VALIDATION_FAILED',
          status: 400,
          code: 'VALIDATION_FAILED',
          detail: 'Invalid content type',
          requestId: 'req-400',
          errors: issues,
        },
        { status: 400 },
      )
    if (unsafeChange !== undefined)
      return problem(409, 'CONFLICT', `Unsafe content type change: ${unsafeChange}`, 'req-unsafe')
    const { version: _, fields, ...rest } = body
    const next: ContentType = {
      ...found,
      ...rest,
      fields: fields === undefined ? found.fields : toFields(fields),
      version: found.version + 1,
    }
    contentTypes.splice(contentTypes.indexOf(found), 1, next)
    return Response.json(next)
  }

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/^\/api\/v1/, '')
    calls.push(`${request.method} ${path}`)
    if (path === '/auth/sign-in') {
      const body = (await request.json()) as { email: string; password: string }
      if (body.email !== USER.email || body.password !== PASSWORD)
        return problem(401, 'UNAUTHORIZED', 'Invalid email or password')
      return session()
    }
    if (path === '/auth/refresh')
      return cookie === undefined ? problem(401, 'UNAUTHORIZED', 'No session') : session()
    if (path === '/auth/sign-out') {
      cookie = undefined
      live.clear()
      return new Response(null, { status: 204 })
    }
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
    if (token === undefined || !live.has(token))
      return problem(401, 'UNAUTHORIZED', 'Not signed in')
    if (failNext !== undefined) {
      const response = failNext
      failNext = undefined
      return response
    }

    if (path === '/field-types') return Response.json(fieldTypes)
    const handled = await content.handle(request, path)
    if (handled !== undefined) return handled
    const typesPath = path.match(/^\/spaces\/([^/]+)\/content-types(?:\/([^/]+))?$/)
    if (typesPath !== null) return contentTypeRoute(request, typesPath[2])
    if (path === '/users/me/preferences') {
      if (request.method === 'PUT') preferences = (await request.json()) as UserPreferences
      return Response.json(preferences)
    }
    if (path === '/organizations' && request.method === 'GET')
      return Response.json({ organizations })
    if (path === '/organizations' && request.method === 'POST') {
      const body = (await request.json()) as { name: string; slug: string }
      if (organizations.some((o) => o.slug === body.slug))
        return problem(409, 'CONFLICT', 'The slug is taken', 'req-conflict')
      const org = {
        id: `o${organizations.length + 1}`,
        ...body,
        createdAt: stamp,
        updatedAt: stamp,
      }
      organizations.push(org)
      return Response.json(org, { status: 201 })
    }
    const orgSpaces = path.match(/^\/organizations\/([^/]+)\/spaces$/)
    if (orgSpaces !== null) {
      const orgId = orgSpaces[1]
      if (request.method === 'GET')
        return Response.json({ spaces: spaces.filter((s) => s.organizationId === orgId) })
      const body = (await request.json()) as { name: string; slug: string }
      const space = {
        id: `s${spaces.length + 1}`,
        organizationId: orgId ?? '',
        name: body.name,
        slug: body.slug,
        createdAt: stamp,
        updatedAt: stamp,
      }
      spaces.push(space)
      return Response.json(details(space), { status: 201 })
    }
    const spacePath = path.match(/^\/spaces\/([^/]+)$/)
    if (spacePath !== null) {
      const space = spaces.find((s) => s.id === spacePath[1])
      return space === undefined
        ? problem(404, 'NOT_FOUND', 'Space not found', 'req-404')
        : Response.json(details(space))
    }
    return problem(404, 'NOT_FOUND', `No route ${path}`)
  }

  return {
    fetch,
    calls,
    organizations,
    spaces,
    /** Answers the next authenticated call with this response. */
    failNextWith(response: Response) {
      failNext = response
    },
    preferences: () => preferences,
    contentTypes,
    content,
    /** Bodies of every content type update, in order. */
    contentTypeBodies,
    /** The next saves answer 409 "Unsafe content type change: …" until reset. */
    setUnsafeChange(message: string | undefined) {
      unsafeChange = message
    },
    /** Someone else saves the content type (bumps its version). */
    bumpVersion(id: string) {
      const type = contentTypes.find((t) => t.id === id)
      if (type !== undefined)
        contentTypes.splice(contentTypes.indexOf(type), 1, { ...type, version: type.version + 1 })
    },
    setPreferences(next: UserPreferences) {
      preferences = next
    },
    /** Server-side session end (e.g. revoked elsewhere). */
    revoke() {
      cookie = undefined
      live.clear()
    },
    problem,
  }
}
