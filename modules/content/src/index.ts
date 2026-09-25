/**
 * `@blixis/content` — content types, components, and field types (plan 010); entries and
 * publishing follow in plan 011. Other modules use its services; they never read its tables.
 *
 * @packageDocumentation
 */

export {
  CONTENT_TYPE_SERVICE,
  type ContentTypeService,
  type ContentTypeView,
  ENTRY_USAGE,
  type EntryUsage,
  type FieldView,
} from './application/content-type.service.ts'
export {
  type ApiFields,
  compileEntrySchema,
  createEntrySchemaCache,
  type EntrySchema,
  type EntrySchemaCache,
  type EntrySchemaOptions,
  type StoredFields,
} from './application/entry-schema.ts'
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
export { contentTypeCreated, contentTypeDeleted, contentTypeUpdated } from './events.ts'
export {
  assetField,
  BUILT_IN_FIELD_TYPES,
  blocksField,
  booleanField,
  dateField,
  dateTimeField,
  jsonField,
  linkField,
  longTextField,
  numberField,
  referenceField,
  richTextField,
  selectField,
  textField,
} from './field-types/built-in/index.ts'
export { LINK_KINDS } from './field-types/built-in/links.ts'
export { RICH_TEXT_MARKS, RICH_TEXT_NODES } from './field-types/built-in/rich-text.ts'
export {
  createFieldTypeRegistry,
  defineFieldType,
  FIELD_TYPES,
  type FieldTypeDefinition,
  type FieldTypeInfo,
  type FieldTypeRegistry,
  type FieldValueContext,
  type GraphqlHint,
  isEmptyValue,
  type ResolvedComponent,
  type ValidationMode,
} from './field-types/define.ts'
export type { EnvironmentTenant } from './infrastructure/content-type.repository.ts'
export { type ContentModuleOptions, contentModule } from './module.ts'
export { CONTENT_PERMISSIONS } from './permissions.ts'
