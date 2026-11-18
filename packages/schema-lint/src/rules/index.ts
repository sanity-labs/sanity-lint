import type { SchemaRule } from '../types'

// Core rules
import { missingDefineType } from './missing-define-type'
import { missingDefineField } from './missing-define-field'
import { missingIcon } from './missing-icon'
import { missingTitle } from './missing-title'
import { missingDescription } from './missing-description'
import { presentationFieldName } from './presentation-field-name'

// Field rules
import { booleanInsteadOfList } from './boolean-instead-of-list'
import { missingSlugSource } from './missing-slug-source'
import { missingRequiredValidation } from './missing-required-validation'
import { reservedFieldName } from './reserved-field-name'

// Array & Reference rules
import { arrayMissingConstraints } from './array-missing-constraints'
import { headingLevelInSchema } from './heading-level-in-schema'
import { unnecessaryReference } from './unnecessary-reference'

/**
 * All available schema lint rules (13 total)
 */
export const rules: Array<SchemaRule> = [
  // Core rules
  missingDefineType,
  missingDefineField,
  missingIcon,
  missingTitle,
  missingDescription,
  presentationFieldName,

  // Field rules
  booleanInsteadOfList,
  missingSlugSource,
  missingRequiredValidation,
  reservedFieldName,

  // Array & Reference rules
  arrayMissingConstraints,
  headingLevelInSchema,
  unnecessaryReference,
]

// Named exports for direct imports
export {
  // Core rules
  missingDefineType,
  missingDefineField,
  missingIcon,
  missingTitle,
  missingDescription,
  presentationFieldName,
  // Field rules
  booleanInsteadOfList,
  missingSlugSource,
  missingRequiredValidation,
  reservedFieldName,
  // Array & Reference rules
  arrayMissingConstraints,
  headingLevelInSchema,
  unnecessaryReference,
}
