import type { FieldTypeDefinition } from '../define.ts'
import { blocksField } from './blocks.ts'
import { assetField, linkField, referenceField } from './links.ts'
import { richTextField } from './rich-text.ts'
import {
  booleanField,
  dateField,
  dateTimeField,
  jsonField,
  longTextField,
  numberField,
  selectField,
  textField,
} from './scalars.ts'

/** The 13 built-in field types (ADR 0010 §4), in editor order. */
export const BUILT_IN_FIELD_TYPES: readonly FieldTypeDefinition<never>[] = [
  textField,
  longTextField,
  richTextField,
  numberField,
  booleanField,
  dateField,
  dateTimeField,
  selectField,
  referenceField,
  assetField,
  linkField,
  blocksField,
  jsonField,
] as unknown as readonly FieldTypeDefinition<never>[]

export {
  assetField,
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
}
