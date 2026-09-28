/**
 * `@blixis/content-api` — the public content capabilities (ADR 0016): service tokens, entry and
 * content type views, and content events. Modules depend on this package, not on the
 * `@blixis/content` implementation, which provides and re-exports everything here.
 *
 * @packageDocumentation
 */

export {
  CONTENT_TYPE_KINDS,
  CONTENT_TYPE_SERVICE,
  type ContentType,
  type ContentTypeKind,
  type ContentTypeService,
  type ContentTypeView,
  type CreateContentTypeInput,
  type EnvironmentTenant,
  type FieldDefinition,
  type FieldGroup,
  type FieldInput,
  type FieldView,
  type ShowWhen,
  type UpdateContentTypeInput,
} from './content-types.ts'
export {
  type ApiFields,
  CONTENT_SERVICE,
  type ContentService,
  type EntryListQuery,
  type EntryState,
  type EntryStatus,
  type EntrySys,
  type EntryVersionView,
  type EntryView,
} from './entries.ts'
export {
  type ContentTypeEventPayload,
  contentTypeCreated,
  contentTypeDeleted,
  contentTypeUpdated,
  type EntryEventPayload,
  entryCreated,
  entryDeleted,
  entryPublished,
  entryUnpublished,
  entryUpdated,
} from './events.ts'
export { type FieldSpec, struct } from './schema.ts'
