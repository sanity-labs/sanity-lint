import type { SchemaRule } from '../types'

/**
 * Field names that typically should have required validation
 */
const TYPICALLY_REQUIRED_FIELDS = new Set([
  'title',
  'name',
  'slug',
  'email',
  'url',
  'headline',
  'heading',
])

/**
 * Rule: missing-required-validation
 *
 * Critical fields like title, name, and slug should have validation rules.
 */
export const missingRequiredValidation: SchemaRule = {
  id: 'missing-required-validation',
  name: 'Missing required validation',
  description: 'Critical fields should have validation rules',
  severity: 'warning',
  category: 'correctness',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    // Only check document types
    if (schema.type !== 'document') {
      return
    }

    for (const field of schema.fields) {
      const name = field.name.toLowerCase()

      if (TYPICALLY_REQUIRED_FIELDS.has(name) && !field.hasValidation) {
        context.report({
          message: `Field "${field.name}" in document type should have validation`,
          severity: 'warning',
          ...(field.span && { span: field.span }),
          help: 'Add validation: (rule) => rule.required() for critical fields',
        })
      }
    }
  },
}
