import type { SchemaRule } from '../types'

/**
 * Rule: missing-slug-source
 *
 * Slug fields should have options.source for auto-generation.
 * Accepts both string paths and functions (needed for nested object fields).
 */
export const missingSlugSource: SchemaRule = {
  id: 'missing-slug-source',
  name: 'Missing slug source',
  description: 'Slug fields should have options.source for auto-generation',
  severity: 'warning',
  category: 'style',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    for (const field of schema.fields) {
      if (field.type !== 'slug') {
        continue
      }

      if (!field.options?.source) {
        context.report({
          message: `Slug field "${field.name}" should have options.source`,
          severity: 'warning',
          ...(field.span && { span: field.span }),
          help: 'Add options: { source: "title" } or a source function (e.g. for nested fields)',
        })
      }
    }
  },
}
