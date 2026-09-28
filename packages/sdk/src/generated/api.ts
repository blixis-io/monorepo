// Generated from apps/api/openapi.json by `pnpm openapi:generate` (ADR 0015). Do not edit.
/* biome-ignore-all lint: generated */

/** RFC 9457 problem details (docs/contracts/errors.md) */
export type Problem = {
  type: string
  title: string
  status: number
  code: "VALIDATION_FAILED" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "UNAUTHORIZED" | "RATE_LIMITED" | "MODULE_ERROR" | "INFRASTRUCTURE_ERROR" | "INTERNAL"
  detail?: string | undefined
  requestId: string
  errors?: {
    path: (string | number)[]
    message: string
    code?: string | undefined
  }[] | undefined
  details?: unknown | undefined
}

/** A personal API token (never the token itself) */
export type ApiToken = {
  id: string
  name: string
  /** First characters, e.g. `blx_pat_Ab3d` */
  prefix: string
  /** Empty: every permission of the owner */
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

/** A file with its metadata */
export type Asset = {
  sys: {
    id: string
    type: "asset"
    environmentId: string
    /** Send it back as `If-Match` */
    version: number
    status: "pending" | "draft" | "published"
    publishedAt: string | null
    firstPublishedAt: string | null
    createdAt: string
    updatedAt: string
    createdBy: string
    updatedBy: string
  }
  fields: {
    filename: string
    /** Text per locale code */
    title: Record<string, string>
    /** Text per locale code */
    description: Record<string, string>
    mimeType: string
    /** Bytes; `null` while pending */
    size: number | null
    sha256: string | null
    width: number | null
    height: number | null
    /** Path on the delivery route; `null` while pending */
    url: string | null
  }
}

/** A content type or component */
export type ContentType = {
  id: string
  environmentId: string
  kind: "entry" | "component"
  apiId: string
  name: string
  description: string
  displayField: string | null
  groups: {
    id: string
    name: string
  }[]
  fields: Field[]
  /** Send it back as `version` when updating */
  version: number
  /** ISO 8601, UTC */
  createdAt: string
  /** ISO 8601, UTC */
  updatedAt: string
}

/** A delivery or preview key of a space (never the key itself) */
export type DeliveryKey = {
  id: string
  kind: "delivery" | "preview"
  name: string
  /** e.g. `blx_dk_Ab3x` */
  prefix: string
  /** `null`: every environment */
  environmentIds: string[] | null
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
}

/** An entry with the fields of one version */
export type Entry = {
  sys: EntrySys
  /** Field values keyed by apiId; localized fields map locale codes to values */
  fields: Record<string, unknown>
}

/** System properties of an entry */
export type EntrySys = {
  id: string
  type: "entry"
  contentType: {
    id: string
    apiId: string
  }
  environmentId: string
  /** Current version number; send it back as `If-Match` */
  version: number
  /** Version the fields come from */
  fieldsVersion: number
  status: "draft" | "published" | "changed"
  publishedVersionId: string | null
  publishedAt: string | null
  firstPublishedAt: string | null
  /** ISO 8601, UTC */
  createdAt: string
  /** ISO 8601, UTC */
  updatedAt: string
  createdBy: string
  updatedBy: string
}

/** One immutable version of an entry */
export type EntryVersion = {
  sys: {
    id: string
    entryId: string
    number: number
    contentTypeVersion: number
    restoredFrom: string | null
    isCurrent: boolean
    isPublished: boolean
    /** ISO 8601, UTC */
    createdAt: string
    createdBy: string
  }
  /** Field values keyed by apiId; localized fields map locale codes to values */
  fields: Record<string, unknown>
}

/** A content environment of a space (MVP: `main`) */
export type Environment = {
  id: string
  organizationId: string
  spaceId: string
  key: string
  isDefault: boolean
  /** ISO 8601, UTC */
  createdAt: string
}

/** A field of a content type or component */
export type Field = {
  /** Stable 8-character id; keys stored values */
  id: string
  apiId: string
  name: string
  /** A field type id, e.g. `text`, `blocks`, `acme.color` */
  type: string
  required: boolean
  localized: boolean
  disabled: boolean
  settings: Record<string, unknown>
  description?: string | undefined
  group?: string | undefined
  hidden?: boolean | undefined
  showWhen?: {
    field: string
    equals: unknown
  } | undefined
}

/** A field type available in this app */
export type FieldType = {
  id: string
  name: string
  description: string
  localizable: boolean
  builtIn: boolean
  /** JSON Schema of the type’s settings */
  settingsSchema: unknown
}

/** A locale of a space, with an optional fallback */
export type Locale = {
  id: string
  organizationId: string
  spaceId: string
  /** BCP 47, e.g. `nl-NL` */
  code: string
  name: string
  isDefault: boolean
  fallbackCode: string | null
  /** ISO 8601, UTC */
  createdAt: string
}

/** A member of an organization or a space */
export type Member = {
  /** Membership id */
  id: string
  userId: string
  email: string | null
  displayName: string | null
  /** A system role key (`owner`, `admin`, `editor`, `viewer`) or a custom role id */
  role: string
  /** ISO 8601, UTC */
  createdAt: string
}

/** A top-level tenant: owns spaces and members */
export type Organization = {
  id: string
  name: string
  slug: string
  /** ISO 8601, UTC */
  createdAt: string
  /** ISO 8601, UTC */
  updatedAt: string
}

/** Every permission, grouped by module */
export type PermissionCatalog = {
  modules: {
    module: string
    permissions: {
      id: string
      description: string
      scope: string
      defaultRoles: string[]
      deliveryKeys: string[]
    }[]
  }[]
}

/** Readiness report (no hosts or error messages) */
export type Readiness = {
  status: "ok" | "unavailable"
  checks: Record<string, {
    status: "ok" | "fail"
    latencyMs: number
  }>
}

/** A system or custom role: a set of permissions */
export type Role = {
  /** System role key (`owner`, `admin`, `editor`, `viewer`) or custom role id */
  id: string
  /** `null` for system roles */
  organizationId: string | null
  name: string
  description: string
  permissions: string[]
  system: boolean
  assignableTo: ("organization" | "space")[]
  createdAt: string | null
  updatedAt: string | null
}

/** Tokens of a signed-in session */
export type Session = {
  tokenType: "Bearer"
  /** EdDSA JWT, valid for `expiresIn` seconds (15 minutes) */
  accessToken: string
  expiresIn: number
  /** Only with `tokenDelivery: "body"`; browsers get an HttpOnly cookie instead */
  refreshToken?: string | undefined
  refreshTokenExpiresAt?: string | undefined
  user: User
}

/** A content space inside an organization */
export type Space = {
  id: string
  organizationId: string
  name: string
  slug: string
  /** ISO 8601, UTC */
  createdAt: string
  /** ISO 8601, UTC */
  updatedAt: string
}

/** A space with its environments and locales */
export type SpaceDetails = {
  id: string
  organizationId: string
  name: string
  slug: string
  /** ISO 8601, UTC */
  createdAt: string
  /** ISO 8601, UTC */
  updatedAt: string
  environments: Environment[]
  locales: Locale[]
}

/** CSS variable values for light and dark mode */
export type Theme = {
  name: string
  preset: string | null
  light: Record<string, string>
  dark: Record<string, string>
}

/** A user account */
export type User = {
  id: string
  email: string
  displayName: string
  status: "active" | "disabled"
  createdAt: string
  updatedAt: string
}

/** UI preferences of the signed-in user */
export type UserPreferences = {
  colorScheme: "system" | "light" | "dark"
  theme: Theme | null
}

/** A webhook (never its secret) */
export type Webhook = {
  id: string
  name: string
  url: string
  /** Public event types, `group.*`, or `*` */
  eventTypes: string[]
  environmentId: string | null
  active: boolean
  /** e.g. `whsec_…a1b2` */
  secretHint: string
  failureCount: number
  disabledReason: string | null
  version: number
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

/** One HTTP attempt of a delivery */
export type WebhookAttempt = {
  number: number
  startedAt: string
  durationMs: number
  statusCode: number | null
  error: string | null
  /** At most the first 1 KB */
  responseExcerpt: string | null
}

/** What an endpoint receives (docs/api/webhooks.md) */
export type WebhookBody = {
  /** Event id: deduplicate on it */
  id: string
  type: string
  version: number
  createdAt: string
  spaceId: string
  environmentId: string | null
  data: Record<string, unknown>
}

/** One event sent (or to be sent) to one webhook */
export type WebhookDelivery = {
  /** Also the `Blixis-Delivery-Id` header */
  id: string
  eventId: string
  eventType: string
  status: "pending" | "succeeded" | "failed" | "abandoned"
  attempts: number
  nextAttemptAt: string | null
  lastStatusCode: number | null
  lastError: string | null
  payload: WebhookBody
  createdAt: string
  updatedAt: string
}

/** Every Management API operation by `operationId`: its inputs and its success response. */
export interface Operations {
  /** DELETE /api/v1/assets/{assetId}/upload — Abort a multipart upload */
  abortAssetUpload: {
    params: { assetId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** POST /api/v1/organizations/{orgId}/members — Add an existing user to the organization */
  addOrganizationMember: {
    params: { orgId: string }
    query: Record<string, never>
    body: {
      email: string
      role: string
    }
    response: Member
  }
  /** POST /api/v1/spaces/{spaceId}/members — Add an existing user to the space */
  addSpaceMember: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      email: string
      role: string
    }
    response: Member
  }
  /** PATCH /api/v1/organizations/{orgId}/members/{membershipId} — Change an organization member’s role */
  changeOrganizationMemberRole: {
    params: { orgId: string; membershipId: string }
    query: Record<string, never>
    body: {
      role: string
    }
    response: Member
  }
  /** PATCH /api/v1/spaces/{spaceId}/members/{membershipId} — Change a space member’s role */
  changeSpaceMemberRole: {
    params: { spaceId: string; membershipId: string }
    query: Record<string, never>
    body: {
      role: string
    }
    response: Member
  }
  /** POST /api/v1/assets/{assetId}/upload/complete — Assemble the parts and create the asset */
  completeAssetUpload: {
    params: { assetId: string }
    query: Record<string, never>
    body: {
      parts: {
        partNumber: number
        etag: string
      }[]
    }
    response: Asset
  }
  /** POST /api/v1/auth/tokens — Create an API token; the token is returned once */
  createApiToken: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      name: string
      scopes?: string[] | undefined
      expiresInDays?: number | undefined
    }
    response: {
      id: string
      name: string
      /** First characters, e.g. `blx_pat_Ab3d` */
      prefix: string
      /** Empty: every permission of the owner */
      scopes: string[]
      expiresAt: string | null
      lastUsedAt: string | null
      createdAt: string
      /** `blx_pat_…`, shown once */
      token: string
    }
  }
  /** POST /api/v1/spaces/{spaceId}/content-types — Create a content type or component */
  createContentType: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      kind?: "entry" | "component" | undefined
      apiId: string
      name: string
      description?: string | undefined
      displayField?: string | null | undefined
      groups?: {
        id: string
        name: string
      }[] | undefined
      fields?: {
        id?: string | undefined
        apiId: string
        name: string
        type: string
        required?: boolean | undefined
        localized?: boolean | undefined
        disabled?: boolean | undefined
        settings?: Record<string, unknown> | undefined
        description?: string | undefined
        group?: string | undefined
        hidden?: boolean | undefined
        showWhen?: {
          field: string
          equals: unknown
        } | undefined
      }[] | undefined
    }
    response: ContentType
  }
  /** POST /api/v1/spaces/{spaceId}/delivery-keys — Create a delivery (`blx_dk_`) or preview (`blx_pk_`) key; the key is returned once */
  createDeliveryKey: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      name: string
      kind: "delivery" | "preview"
      environmentIds?: string[] | null | undefined
    }
    response: {
      id: string
      kind: "delivery" | "preview"
      name: string
      /** e.g. `blx_dk_Ab3x` */
      prefix: string
      /** `null`: every environment */
      environmentIds: string[] | null
      createdBy: string
      createdAt: string
      lastUsedAt: string | null
      /** Shown once */
      key: string
    }
  }
  /** POST /api/v1/spaces/{spaceId}/entries — Create an entry (version 1, a draft) */
  createEntry: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      /** apiId or id */
      contentType: string
      /** Field values keyed by apiId; localized fields map locale codes to values */
      fields?: Record<string, unknown> | undefined
    }
    response: Entry
  }
  /** POST /api/v1/spaces/{spaceId}/locales — Add a locale */
  createLocale: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      code: string
      name?: string | undefined
      fallbackCode?: string | null | undefined
      isDefault?: boolean | undefined
    }
    response: Locale
  }
  /** POST /api/v1/organizations — Create an organization (you become its owner) */
  createOrganization: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      name: string
      /** Lower-case letters, digits, hyphens (1–63) */
      slug: string
    }
    response: Organization
  }
  /** POST /api/v1/organizations/{orgId}/roles — Create a custom role (only with permissions you hold) */
  createRole: {
    params: { orgId: string }
    query: Record<string, never>
    body: {
      name: string
      description?: string | undefined
      permissions: string[]
    }
    response: Role
  }
  /** POST /api/v1/organizations/{orgId}/spaces — Create a space with its default environment and locale */
  createSpace: {
    params: { orgId: string }
    query: Record<string, never>
    body: {
      name: string
      /** Lower-case letters, digits, hyphens (1–63) */
      slug: string
      /** Default `en-US` */
      defaultLocale?: string | undefined
    }
    response: SpaceDetails
  }
  /** POST /api/v1/spaces/{spaceId}/webhooks — Create a webhook; the signing secret is returned once */
  createWebhook: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      name: string
      /** https:// on a public host */
      url: string
      eventTypes: string[]
      environmentId?: string | null | undefined
      active?: boolean | undefined
    }
    response: {
      webhook: Webhook
      /** `whsec_…`, shown once */
      secret: string
    }
  }
  /** DELETE /api/v1/assets/{assetId} — Delete an unpublished asset and its file */
  deleteAsset: {
    params: { assetId: string }
    query: { force?: boolean | undefined }
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/spaces/{spaceId}/content-types/{contentTypeId} — Delete a content type without entries */
  deleteContentType: {
    params: { spaceId: string; contentTypeId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/entries/{entryId} — Delete an unpublished entry with all versions */
  deleteEntry: {
    params: { entryId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/spaces/{spaceId}/locales/{localeId} — Delete a locale (not the default) */
  deleteLocale: {
    params: { spaceId: string; localeId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/organizations/{orgId}/roles/{roleId} — Delete an unassigned custom role */
  deleteRole: {
    params: { orgId: string; roleId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/spaces/{spaceId} — Delete a space and everything in it */
  deleteSpace: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/webhooks/{webhookId} — Delete a webhook and its delivery log */
  deleteWebhook: {
    params: { webhookId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** GET /assets/{spaceId}/{assetId}/{fileId}/{filename} — Download a file: public when published, preview access otherwise */
  downloadAsset: {
    params: { spaceId: string; assetId: string; fileId: string; filename: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** GET /api/v1/assets/{assetId} — Get an asset */
  getAsset: {
    params: { assetId: string }
    query: Record<string, never>
    body: undefined
    response: Asset
  }
  /** GET /api/v1/spaces/{spaceId}/content-types/{contentTypeId} — Get a content type (by id or apiId) */
  getContentType: {
    params: { spaceId: string; contentTypeId: string }
    query: Record<string, never>
    body: undefined
    response: ContentType
  }
  /** GET /api/v1/auth/me — The signed-in user */
  getCurrentUser: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: User
  }
  /** GET /api/v1/entries/{entryId} — Get an entry (current or published version) */
  getEntry: {
    params: { entryId: string }
    query: { state?: "draft" | "published" | undefined; include?: number | undefined }
    body: undefined
    response: {
      sys: EntrySys
      /** Field values keyed by apiId; localized fields map locale codes to values */
      fields: Record<string, unknown>
      /** Linked entries, with `include` */
      includes?: {
        entries: Entry[]
      } | undefined
    }
  }
  /** GET /api/v1/entries/{entryId}/versions/{versionId} — One version */
  getEntryVersion: {
    params: { entryId: string; versionId: string }
    query: Record<string, never>
    body: undefined
    response: EntryVersion
  }
  /** GET /api/v1/health — Liveness: answers before modules boot */
  getHealth: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: {
      status: "ok"
    }
  }
  /** GET /api/v1/auth/jwks — Public keys that verify access tokens (JWKS) */
  getJwks: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: {
      keys: Record<string, unknown>[]
    }
  }
  /** GET /api/v1/openapi.json — This OpenAPI 3.1 document */
  getOpenApiDocument: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** GET /api/v1/organizations/{orgId} — Get an organization */
  getOrganization: {
    params: { orgId: string }
    query: Record<string, never>
    body: undefined
    response: Organization
  }
  /** GET /api/v1/users/me/preferences — Your UI preferences (color scheme and theme) */
  getPreferences: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: UserPreferences
  }
  /** GET /api/v1/users/me — Your profile (users and API tokens) */
  getProfile: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: User
  }
  /** GET /api/v1/health/ready — Readiness: modules booted and health checks passing (503 otherwise) */
  getReadiness: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: Readiness
  }
  /** GET /api/v1/spaces/{spaceId} — Get a space with its environments and locales */
  getSpace: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: SpaceDetails
  }
  /** GET /api/v1/webhooks/{webhookId} — Get a webhook */
  getWebhook: {
    params: { webhookId: string }
    query: Record<string, never>
    body: undefined
    response: Webhook
  }
  /** GET /api/v1/webhooks/{webhookId}/deliveries/{deliveryId} — One delivery with every attempt */
  getWebhookDelivery: {
    params: { webhookId: string; deliveryId: string }
    query: Record<string, never>
    body: undefined
    response: {
      /** Also the `Blixis-Delivery-Id` header */
      id: string
      eventId: string
      eventType: string
      status: "pending" | "succeeded" | "failed" | "abandoned"
      attempts: number
      nextAttemptAt: string | null
      lastStatusCode: number | null
      lastError: string | null
      payload: WebhookBody
      createdAt: string
      updatedAt: string
      attemptLog: WebhookAttempt[]
    }
  }
  /** GET /api/v1/auth/tokens — Your API tokens (needs a signed-in session, not an API token) */
  listApiTokens: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: {
      tokens: ApiToken[]
    }
  }
  /** GET /api/v1/spaces/{spaceId}/assets — List assets, newest first */
  listAssets: {
    params: { spaceId: string }
    query: { state?: "draft" | "published" | "pending" | undefined; mimeType?: string | undefined; limit?: number | undefined; cursor?: string | undefined; environment?: string | undefined }
    body: undefined
    response: {
      assets: Asset[]
      nextCursor: string | null
    }
  }
  /** GET /api/v1/spaces/{spaceId}/content-types — Content types and components */
  listContentTypes: {
    params: { spaceId: string }
    query: { kind?: "entry" | "component" | undefined; environment?: string | undefined }
    body: undefined
    response: {
      contentTypes: ContentType[]
    }
  }
  /** GET /api/v1/spaces/{spaceId}/delivery-keys — Delivery and preview keys of a space */
  listDeliveryKeys: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: {
      deliveryKeys: DeliveryKey[]
    }
  }
  /** GET /api/v1/spaces/{spaceId}/entries — List entries, newest change first */
  listEntries: {
    params: { spaceId: string }
    query: { contentType?: string | undefined; state?: "draft" | "published" | undefined; updatedSince?: string | undefined; limit?: number | undefined; cursor?: string | undefined; include?: number | undefined; environment?: string | undefined }
    body: undefined
    response: {
      entries: Entry[]
      nextCursor: string | null
      /** Linked entries, with `include` */
      includes?: {
        entries: Entry[]
      } | undefined
    }
  }
  /** GET /api/v1/entries/{entryId}/referrers — Entries linking to this one */
  listEntryReferrers: {
    params: { entryId: string }
    query: { state?: "draft" | "published" | undefined }
    body: undefined
    response: {
      entries: Entry[]
    }
  }
  /** GET /api/v1/entries/{entryId}/versions — Versions, newest first */
  listEntryVersions: {
    params: { entryId: string }
    query: { limit?: number | undefined; before?: number | undefined }
    body: undefined
    response: {
      versions: EntryVersion[]
      nextBefore: number | null
    }
  }
  /** GET /api/v1/spaces/{spaceId}/environments — List environments */
  listEnvironments: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: {
      environments: Environment[]
    }
  }
  /** GET /api/v1/field-types — Field types of this app, with their settings schema */
  listFieldTypes: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: {
      fieldTypes: FieldType[]
    }
  }
  /** GET /api/v1/spaces/{spaceId}/locales — List locales */
  listLocales: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: {
      locales: Locale[]
    }
  }
  /** GET /api/v1/organizations/{orgId}/members — List organization members */
  listOrganizationMembers: {
    params: { orgId: string }
    query: Record<string, never>
    body: undefined
    response: {
      members: Member[]
    }
  }
  /** GET /api/v1/organizations — List your organizations */
  listOrganizations: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: {
      organizations: Organization[]
    }
  }
  /** GET /api/v1/permissions — The permission catalog, for role editors */
  listPermissions: {
    params: Record<string, never>
    query: Record<string, never>
    body: undefined
    response: PermissionCatalog
  }
  /** GET /api/v1/organizations/{orgId}/roles — System and custom roles of an organization */
  listRoles: {
    params: { orgId: string }
    query: Record<string, never>
    body: undefined
    response: {
      roles: Role[]
    }
  }
  /** GET /api/v1/spaces/{spaceId}/members — List space members */
  listSpaceMembers: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: {
      members: Member[]
    }
  }
  /** GET /api/v1/organizations/{orgId}/spaces — List the spaces of an organization you can see */
  listSpaces: {
    params: { orgId: string }
    query: Record<string, never>
    body: undefined
    response: {
      spaces: Space[]
    }
  }
  /** GET /api/v1/webhooks/{webhookId}/deliveries — The delivery log, newest first */
  listWebhookDeliveries: {
    params: { webhookId: string }
    query: { status?: "pending" | "succeeded" | "failed" | "abandoned" | undefined; limit?: number | undefined; cursor?: string | undefined }
    body: undefined
    response: {
      deliveries: WebhookDelivery[]
      nextCursor: string | null
    }
  }
  /** GET /api/v1/spaces/{spaceId}/webhooks — Webhooks of a space */
  listWebhooks: {
    params: { spaceId: string }
    query: Record<string, never>
    body: undefined
    response: {
      webhooks: Webhook[]
    }
  }
  /** POST /api/v1/assets/{assetId}/publish — Publish an asset */
  publishAsset: {
    params: { assetId: string }
    query: Record<string, never>
    body: undefined
    response: Asset
  }
  /** POST /api/v1/entries/{entryId}/publish — Publish a version (default: the current one) */
  publishEntry: {
    params: { entryId: string }
    query: Record<string, never>
    body: {
      versionId?: string | undefined
      expectedVersion?: number | undefined
    }
    response: Entry
  }
  /** POST /api/v1/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver — Send a delivery again (same delivery id) */
  redeliverWebhook: {
    params: { webhookId: string; deliveryId: string }
    query: Record<string, never>
    body: undefined
    response: WebhookDelivery
  }
  /** POST /api/v1/auth/refresh — Exchange a refresh token (cookie or body) for new tokens; it rotates */
  refreshSession: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      refreshToken?: string | undefined
    }
    response: Session
  }
  /** DELETE /api/v1/organizations/{orgId}/members/{membershipId} — Remove an organization member */
  removeOrganizationMember: {
    params: { orgId: string; membershipId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/spaces/{spaceId}/members/{membershipId} — Remove a space member */
  removeSpaceMember: {
    params: { spaceId: string; membershipId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** PUT /api/v1/assets/{assetId}/file — Replace the file (single request); the old file is deleted after the change */
  replaceAssetFile: {
    params: { assetId: string }
    query: Record<string, never>
    body: BinaryBody
    response: Asset
  }
  /** POST /api/v1/entries/{entryId}/versions/{versionId}/restore — Save an old version’s fields as a new version */
  restoreEntryVersion: {
    params: { entryId: string; versionId: string }
    query: Record<string, never>
    body: {
      expectedVersion?: number | undefined
    }
    response: Entry
  }
  /** DELETE /api/v1/auth/tokens/{id} — Revoke an API token */
  revokeApiToken: {
    params: { id: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** DELETE /api/v1/spaces/{spaceId}/delivery-keys/{keyId} — Revoke a key (other isolates stop accepting it within 30 seconds) */
  revokeDeliveryKey: {
    params: { spaceId: string; keyId: string }
    query: Record<string, never>
    body: undefined
    response: undefined
  }
  /** POST /api/v1/webhooks/{webhookId}/rotate-secret — Replace the signing secret; the new one is returned once */
  rotateWebhookSecret: {
    params: { webhookId: string }
    query: Record<string, never>
    body: undefined
    response: {
      webhook: Webhook
      /** `whsec_…`, shown once */
      secret: string
    }
  }
  /** POST /api/v1/auth/sign-in — Sign in with email and password */
  signIn: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      email: string
      password: string
      /** `body` returns the refresh token in the response (non-browser clients); default cookie */
      tokenDelivery?: "cookie" | "body" | undefined
    }
    response: Session
  }
  /** POST /api/v1/auth/sign-out — Revoke the refresh-token family and clear the cookie */
  signOut: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      refreshToken?: string | undefined
    }
    response: undefined
  }
  /** POST /api/v1/auth/sign-up — Create an account and sign in (only when the app allows sign-up) */
  signUp: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      email: string
      displayName: string
      /** At least 12 characters */
      password: string
      /** `body` returns the refresh token in the response (non-browser clients); default cookie */
      tokenDelivery?: "cookie" | "body" | undefined
    }
    response: Session
  }
  /** POST /api/v1/spaces/{spaceId}/assets/uploads — Start a multipart upload for a large file */
  startAssetUpload: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      filename: string
      mimeType: string
      size: number
      /** Text per locale code */
      title?: Record<string, string> | undefined
      /** Text per locale code */
      description?: Record<string, string> | undefined
    }
    response: {
      asset: Asset
      partSize: number
      partCount: number
    }
  }
  /** POST /api/v1/webhooks/{webhookId}/test — Send a signed `webhook.ping` */
  testWebhook: {
    params: { webhookId: string }
    query: Record<string, never>
    body: undefined
    response: WebhookDelivery
  }
  /** POST /api/v1/assets/{assetId}/unpublish — Unpublish an asset (refused while published entries use it, unless forced) */
  unpublishAsset: {
    params: { assetId: string }
    query: Record<string, never>
    body: {
      force?: boolean | undefined
    }
    response: Asset
  }
  /** POST /api/v1/entries/{entryId}/unpublish — Take an entry offline (refused while published entries link to it, unless forced) */
  unpublishEntry: {
    params: { entryId: string }
    query: Record<string, never>
    body: {
      force?: boolean | undefined
    }
    response: Entry
  }
  /** PATCH /api/v1/assets/{assetId} — Change the file name, title, or description */
  updateAsset: {
    params: { assetId: string }
    query: Record<string, never>
    body: {
      filename?: string | undefined
      /** Text per locale code */
      title?: Record<string, string> | undefined
      /** Text per locale code */
      description?: Record<string, string> | undefined
      expectedVersion?: number | undefined
    }
    response: Asset
  }
  /** PATCH /api/v1/spaces/{spaceId}/content-types/{contentTypeId} — Change a content type; `fields` is the complete list */
  updateContentType: {
    params: { spaceId: string; contentTypeId: string }
    query: Record<string, never>
    body: {
      version: number
      kind?: "entry" | "component" | undefined
      apiId?: string | undefined
      name?: string | undefined
      description?: string | undefined
      displayField?: string | null | undefined
      groups?: {
        id: string
        name: string
      }[] | undefined
      fields?: {
        id?: string | undefined
        apiId: string
        name: string
        type: string
        required?: boolean | undefined
        localized?: boolean | undefined
        disabled?: boolean | undefined
        settings?: Record<string, unknown> | undefined
        description?: string | undefined
        group?: string | undefined
        hidden?: boolean | undefined
        showWhen?: {
          field: string
          equals: unknown
        } | undefined
      }[] | undefined
    }
    response: ContentType
  }
  /** PATCH /api/v1/entries/{entryId} — Save a new version with the complete fields */
  updateEntry: {
    params: { entryId: string }
    query: Record<string, never>
    body: {
      /** Field values keyed by apiId; localized fields map locale codes to values */
      fields: Record<string, unknown>
      expectedVersion?: number | undefined
    }
    response: Entry
  }
  /** PATCH /api/v1/spaces/{spaceId}/locales/{localeId} — Change a locale’s name, fallback, or default */
  updateLocale: {
    params: { spaceId: string; localeId: string }
    query: Record<string, never>
    body: {
      name?: string | undefined
      fallbackCode?: string | null | undefined
      isDefault?: boolean | undefined
    }
    response: Locale
  }
  /** PATCH /api/v1/organizations/{orgId} — Rename an organization or change its slug */
  updateOrganization: {
    params: { orgId: string }
    query: Record<string, never>
    body: {
      name?: string | undefined
      /** Lower-case letters, digits, hyphens (1–63) */
      slug?: string | undefined
    }
    response: Organization
  }
  /** PUT /api/v1/users/me/preferences — Replace your UI preferences; omitted fields reset to their defaults */
  updatePreferences: {
    params: Record<string, never>
    query: Record<string, never>
    body: UserPreferences
    response: UserPreferences
  }
  /** PATCH /api/v1/users/me — Change your display name */
  updateProfile: {
    params: Record<string, never>
    query: Record<string, never>
    body: {
      displayName: string
    }
    response: User
  }
  /** PATCH /api/v1/organizations/{orgId}/roles/{roleId} — Change a custom role */
  updateRole: {
    params: { orgId: string; roleId: string }
    query: Record<string, never>
    body: {
      name?: string | undefined
      description?: string | undefined
      permissions?: string[] | undefined
    }
    response: Role
  }
  /** PATCH /api/v1/spaces/{spaceId} — Rename a space or change its slug */
  updateSpace: {
    params: { spaceId: string }
    query: Record<string, never>
    body: {
      name?: string | undefined
      /** Lower-case letters, digits, hyphens (1–63) */
      slug?: string | undefined
    }
    response: Space
  }
  /** PATCH /api/v1/webhooks/{webhookId} — Change a webhook; `active: true` also clears failures */
  updateWebhook: {
    params: { webhookId: string }
    query: Record<string, never>
    body: {
      name?: string | undefined
      /** https:// on a public host */
      url?: string | undefined
      eventTypes?: string[] | undefined
      environmentId?: string | null | undefined
      active?: boolean | undefined
      expectedVersion?: number | undefined
    }
    response: Webhook
  }
  /** POST /api/v1/spaces/{spaceId}/assets — Upload a file in one request (≤ 90 MiB); the body is the file */
  uploadAsset: {
    params: { spaceId: string }
    query: Record<string, never>
    body: BinaryBody
    response: Asset
  }
  /** PUT /api/v1/assets/{assetId}/upload/parts/{partNumber} — Upload one part (exactly `partSize` bytes, except the last) */
  uploadAssetPart: {
    params: { assetId: string; partNumber: string }
    query: Record<string, never>
    body: BinaryBody
    response: {
      partNumber: number
      etag: string
    }
  }
}

/** A raw file body for uploads. */
export type BinaryBody = Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>

/** How an operation is called. */
export interface Route { readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; readonly path: string; readonly body: 'none' | 'json' | 'binary'; readonly auth?: false; readonly idempotent?: true }

/** How to call each operation (method, path template, body kind). */
export const ROUTES = {
  abortAssetUpload: { method: 'DELETE', path: '/api/v1/assets/{assetId}/upload', body: 'none' },
  addOrganizationMember: { method: 'POST', path: '/api/v1/organizations/{orgId}/members', body: 'json' },
  addSpaceMember: { method: 'POST', path: '/api/v1/spaces/{spaceId}/members', body: 'json' },
  changeOrganizationMemberRole: { method: 'PATCH', path: '/api/v1/organizations/{orgId}/members/{membershipId}', body: 'json' },
  changeSpaceMemberRole: { method: 'PATCH', path: '/api/v1/spaces/{spaceId}/members/{membershipId}', body: 'json' },
  completeAssetUpload: { method: 'POST', path: '/api/v1/assets/{assetId}/upload/complete', body: 'json' },
  createApiToken: { method: 'POST', path: '/api/v1/auth/tokens', body: 'json' },
  createContentType: { method: 'POST', path: '/api/v1/spaces/{spaceId}/content-types', body: 'json' },
  createDeliveryKey: { method: 'POST', path: '/api/v1/spaces/{spaceId}/delivery-keys', body: 'json' },
  createEntry: { method: 'POST', path: '/api/v1/spaces/{spaceId}/entries', body: 'json' },
  createLocale: { method: 'POST', path: '/api/v1/spaces/{spaceId}/locales', body: 'json' },
  createOrganization: { method: 'POST', path: '/api/v1/organizations', body: 'json' },
  createRole: { method: 'POST', path: '/api/v1/organizations/{orgId}/roles', body: 'json' },
  createSpace: { method: 'POST', path: '/api/v1/organizations/{orgId}/spaces', body: 'json' },
  createWebhook: { method: 'POST', path: '/api/v1/spaces/{spaceId}/webhooks', body: 'json' },
  deleteAsset: { method: 'DELETE', path: '/api/v1/assets/{assetId}', body: 'none' },
  deleteContentType: { method: 'DELETE', path: '/api/v1/spaces/{spaceId}/content-types/{contentTypeId}', body: 'none' },
  deleteEntry: { method: 'DELETE', path: '/api/v1/entries/{entryId}', body: 'none' },
  deleteLocale: { method: 'DELETE', path: '/api/v1/spaces/{spaceId}/locales/{localeId}', body: 'none' },
  deleteRole: { method: 'DELETE', path: '/api/v1/organizations/{orgId}/roles/{roleId}', body: 'none' },
  deleteSpace: { method: 'DELETE', path: '/api/v1/spaces/{spaceId}', body: 'none' },
  deleteWebhook: { method: 'DELETE', path: '/api/v1/webhooks/{webhookId}', body: 'none' },
  downloadAsset: { method: 'GET', path: '/assets/{spaceId}/{assetId}/{fileId}/{filename}', body: 'none', auth: false },
  getAsset: { method: 'GET', path: '/api/v1/assets/{assetId}', body: 'none' },
  getContentType: { method: 'GET', path: '/api/v1/spaces/{spaceId}/content-types/{contentTypeId}', body: 'none' },
  getCurrentUser: { method: 'GET', path: '/api/v1/auth/me', body: 'none' },
  getEntry: { method: 'GET', path: '/api/v1/entries/{entryId}', body: 'none' },
  getEntryVersion: { method: 'GET', path: '/api/v1/entries/{entryId}/versions/{versionId}', body: 'none' },
  getHealth: { method: 'GET', path: '/api/v1/health', body: 'none', auth: false },
  getJwks: { method: 'GET', path: '/api/v1/auth/jwks', body: 'none', auth: false },
  getOpenApiDocument: { method: 'GET', path: '/api/v1/openapi.json', body: 'none', auth: false },
  getOrganization: { method: 'GET', path: '/api/v1/organizations/{orgId}', body: 'none' },
  getPreferences: { method: 'GET', path: '/api/v1/users/me/preferences', body: 'none' },
  getProfile: { method: 'GET', path: '/api/v1/users/me', body: 'none' },
  getReadiness: { method: 'GET', path: '/api/v1/health/ready', body: 'none', auth: false },
  getSpace: { method: 'GET', path: '/api/v1/spaces/{spaceId}', body: 'none' },
  getWebhook: { method: 'GET', path: '/api/v1/webhooks/{webhookId}', body: 'none' },
  getWebhookDelivery: { method: 'GET', path: '/api/v1/webhooks/{webhookId}/deliveries/{deliveryId}', body: 'none' },
  listApiTokens: { method: 'GET', path: '/api/v1/auth/tokens', body: 'none' },
  listAssets: { method: 'GET', path: '/api/v1/spaces/{spaceId}/assets', body: 'none' },
  listContentTypes: { method: 'GET', path: '/api/v1/spaces/{spaceId}/content-types', body: 'none' },
  listDeliveryKeys: { method: 'GET', path: '/api/v1/spaces/{spaceId}/delivery-keys', body: 'none' },
  listEntries: { method: 'GET', path: '/api/v1/spaces/{spaceId}/entries', body: 'none' },
  listEntryReferrers: { method: 'GET', path: '/api/v1/entries/{entryId}/referrers', body: 'none' },
  listEntryVersions: { method: 'GET', path: '/api/v1/entries/{entryId}/versions', body: 'none' },
  listEnvironments: { method: 'GET', path: '/api/v1/spaces/{spaceId}/environments', body: 'none' },
  listFieldTypes: { method: 'GET', path: '/api/v1/field-types', body: 'none' },
  listLocales: { method: 'GET', path: '/api/v1/spaces/{spaceId}/locales', body: 'none' },
  listOrganizationMembers: { method: 'GET', path: '/api/v1/organizations/{orgId}/members', body: 'none' },
  listOrganizations: { method: 'GET', path: '/api/v1/organizations', body: 'none' },
  listPermissions: { method: 'GET', path: '/api/v1/permissions', body: 'none' },
  listRoles: { method: 'GET', path: '/api/v1/organizations/{orgId}/roles', body: 'none' },
  listSpaceMembers: { method: 'GET', path: '/api/v1/spaces/{spaceId}/members', body: 'none' },
  listSpaces: { method: 'GET', path: '/api/v1/organizations/{orgId}/spaces', body: 'none' },
  listWebhookDeliveries: { method: 'GET', path: '/api/v1/webhooks/{webhookId}/deliveries', body: 'none' },
  listWebhooks: { method: 'GET', path: '/api/v1/spaces/{spaceId}/webhooks', body: 'none' },
  publishAsset: { method: 'POST', path: '/api/v1/assets/{assetId}/publish', body: 'none', idempotent: true },
  publishEntry: { method: 'POST', path: '/api/v1/entries/{entryId}/publish', body: 'json', idempotent: true },
  redeliverWebhook: { method: 'POST', path: '/api/v1/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver', body: 'none', idempotent: true },
  refreshSession: { method: 'POST', path: '/api/v1/auth/refresh', body: 'json', auth: false },
  removeOrganizationMember: { method: 'DELETE', path: '/api/v1/organizations/{orgId}/members/{membershipId}', body: 'none' },
  removeSpaceMember: { method: 'DELETE', path: '/api/v1/spaces/{spaceId}/members/{membershipId}', body: 'none' },
  replaceAssetFile: { method: 'PUT', path: '/api/v1/assets/{assetId}/file', body: 'binary' },
  restoreEntryVersion: { method: 'POST', path: '/api/v1/entries/{entryId}/versions/{versionId}/restore', body: 'json' },
  revokeApiToken: { method: 'DELETE', path: '/api/v1/auth/tokens/{id}', body: 'none' },
  revokeDeliveryKey: { method: 'DELETE', path: '/api/v1/spaces/{spaceId}/delivery-keys/{keyId}', body: 'none' },
  rotateWebhookSecret: { method: 'POST', path: '/api/v1/webhooks/{webhookId}/rotate-secret', body: 'none' },
  signIn: { method: 'POST', path: '/api/v1/auth/sign-in', body: 'json', auth: false },
  signOut: { method: 'POST', path: '/api/v1/auth/sign-out', body: 'json', auth: false },
  signUp: { method: 'POST', path: '/api/v1/auth/sign-up', body: 'json', auth: false },
  startAssetUpload: { method: 'POST', path: '/api/v1/spaces/{spaceId}/assets/uploads', body: 'json' },
  testWebhook: { method: 'POST', path: '/api/v1/webhooks/{webhookId}/test', body: 'none' },
  unpublishAsset: { method: 'POST', path: '/api/v1/assets/{assetId}/unpublish', body: 'json', idempotent: true },
  unpublishEntry: { method: 'POST', path: '/api/v1/entries/{entryId}/unpublish', body: 'json', idempotent: true },
  updateAsset: { method: 'PATCH', path: '/api/v1/assets/{assetId}', body: 'json' },
  updateContentType: { method: 'PATCH', path: '/api/v1/spaces/{spaceId}/content-types/{contentTypeId}', body: 'json' },
  updateEntry: { method: 'PATCH', path: '/api/v1/entries/{entryId}', body: 'json' },
  updateLocale: { method: 'PATCH', path: '/api/v1/spaces/{spaceId}/locales/{localeId}', body: 'json' },
  updateOrganization: { method: 'PATCH', path: '/api/v1/organizations/{orgId}', body: 'json' },
  updatePreferences: { method: 'PUT', path: '/api/v1/users/me/preferences', body: 'json' },
  updateProfile: { method: 'PATCH', path: '/api/v1/users/me', body: 'json' },
  updateRole: { method: 'PATCH', path: '/api/v1/organizations/{orgId}/roles/{roleId}', body: 'json' },
  updateSpace: { method: 'PATCH', path: '/api/v1/spaces/{spaceId}', body: 'json' },
  updateWebhook: { method: 'PATCH', path: '/api/v1/webhooks/{webhookId}', body: 'json' },
  uploadAsset: { method: 'POST', path: '/api/v1/spaces/{spaceId}/assets', body: 'binary' },
  uploadAssetPart: { method: 'PUT', path: '/api/v1/assets/{assetId}/upload/parts/{partNumber}', body: 'binary' },
} as const satisfies Record<keyof Operations, Route>
