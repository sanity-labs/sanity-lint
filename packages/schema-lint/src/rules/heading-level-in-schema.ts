import type { SchemaRule } from '../types'

/**
 * Patterns that suggest heading level storage
 */
const HEADING_LEVEL_PATTERNS = [/^(heading|header)Level$/i, /^h[1-6]$/i, /Level$/]

/**
 * Values that suggest heading level options
 */
const HEADING_LEVEL_VALUES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Rule: heading-level-in-schema
 *
 * Heading levels (h1, h2, etc.) should be computed dynamically in components,
 * not stored in the schema.
 */
export const headingLevelInSchema: SchemaRule = {
  id: 'heading-level-in-schema',
  name: 'Heading level in schema',
  description: 'Heading levels should be computed dynamically, not stored in schema',
  severity: 'warning',
  category: 'style',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    for (const field of schema.fields) {
      // Check field name
      for (const pattern of HEADING_LEVEL_PATTERNS) {
        if (pattern.test(field.name)) {
          context.report({
            message: `Field "${field.name}" appears to store heading levels`,
            severity: 'warning',
            ...(field.span && { span: field.span }),
            help: 'Heading levels should be computed dynamically in frontend components based on document structure, not stored in content.',
          })
          break
        }
      }

      // Check options.list for heading level values
      if (field.options?.list && Array.isArray(field.options.list)) {
        const hasHeadingLevels = field.options.list.some((item) => {
          const value =
            typeof item === 'object' && item !== null ? (item as { value?: string }).value : item
          return typeof value === 'string' && HEADING_LEVEL_VALUES.has(value.toLowerCase())
        })

        if (hasHeadingLevels) {
          context.report({
            message: `Field "${field.name}" contains heading level options (h1, h2, etc.)`,
            severity: 'warning',
            ...(field.span && { span: field.span }),
            help: 'Heading levels should be computed dynamically in frontend components based on document structure, not stored in content.',
          })
        }
      }
    }
  },
}
