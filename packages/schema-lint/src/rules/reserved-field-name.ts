import type { SchemaRule } from '../types'

/**
 * Reserved Sanity field name prefixes
 */
const RESERVED_PREFIXES = ['_']

/**
 * Reserved Sanity field names
 */
const RESERVED_NAMES = new Set([
  '_id',
  '_type',
  '_rev',
  '_key',
  '_createdAt',
  '_updatedAt',
  '_ref',
  '_weak',
  '_strengthenOnPublish',
])

/**
 * Rule: reserved-field-name
 *
 * Field names starting with underscore are reserved by Sanity.
 */
export const reservedFieldName: SchemaRule = {
  id: 'reserved-field-name',
  name: 'Reserved field name',
  description: 'Field names starting with _ are reserved by Sanity',
  severity: 'error',
  category: 'correctness',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    for (const field of schema.fields) {
      const name = field.name

      // Check for reserved prefixes
      for (const prefix of RESERVED_PREFIXES) {
        if (name.startsWith(prefix)) {
          const isExactReserved = RESERVED_NAMES.has(name)

          context.report({
            message: `Field name "${name}" uses reserved prefix "${prefix}"`,
            severity: 'error',
            ...(field.span && { span: field.span }),
            help: isExactReserved
              ? `"${name}" is a Sanity system field. Remove this field definition.`
              : `Field names starting with "${prefix}" are reserved. Use a different name.`,
          })
          break
        }
      }
    }
  },
}
