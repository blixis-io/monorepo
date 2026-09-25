/**
 * `@blixis/content` — content types, components, and field types (plan 010); entries and
 * publishing follow in plan 011. Other modules use its services; they never read its tables.
 *
 * @packageDocumentation
 */
export {
  apiIdSchema,
  CONTENT_LIMITS,
  CONTENT_TYPE_KINDS,
  type ContentType,
  type ContentTypeKind,
  type CreateContentTypeInput,
  type FieldDefinition,
  type FieldGroup,
  type FieldInput,
  newShortId,
  RESERVED_FIELD_API_IDS,
  type ShowWhen,
  type UpdateContentTypeInput,
} from './domain/content-type.ts'
export { contentModule } from './module.ts'
export { CONTENT_PERMISSIONS } from './permissions.ts'
