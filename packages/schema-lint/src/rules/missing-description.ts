import type { SchemaRule, SchemaField } from '../types'

/**
 * Rule: missing-description
 *
 * Fields should have descriptions to help content editors.
 */
export const missingDescription: SchemaRule = {
  id: 'missing-description',
  name: 'Missing field description',
  description: 'Fields should have descriptions for better editor UX',
  severity: 'info',
  category: 'style',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    const fieldsWithoutDescription: Array<SchemaField> = []

    for (const field of schema.fields) {
      // Skip hidden fields
      if (field.hidden) {
        continue
      }

      // Skip common fields that don't need descriptions
      if (['_id', '_type', '_rev', '_createdAt', '_updatedAt'].includes(field.name)) {
        continue
      }

      if (!field.description) {
        fieldsWithoutDescription.push(field)
      }
    }

    // Report if more than half of visible fields lack descriptions
    const visibleFields = schema.fields.filter(
      (f) => !f.hidden && !['_id', '_type', '_rev', '_createdAt', '_updatedAt'].includes(f.name)
    )

    if (
      fieldsWithoutDescription.length > 0 &&
      fieldsWithoutDescription.length >= visibleFields.length / 2
    ) {
      const fieldNames = fieldsWithoutDescription.map((f) => f.name).slice(0, 3)
      const moreCount = fieldsWithoutDescription.length - 3

      context.report({
        message: `Fields in "${schema.name}" lack descriptions: ${fieldNames.join(', ')}${moreCount > 0 ? ` and ${moreCount} more` : ''}`,
        severity: 'info',
        ...(schema.span && { span: schema.span }),
        help: 'Add description to fields to help content editors understand what to enter',
      })
    }
  },
}
