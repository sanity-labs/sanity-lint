import type { SchemaRule } from '../types'

/**
 * Rule: missing-icon
 *
 * Document types should have an icon for better Studio UX.
 * Icons appear in Studio navigation and make document types easier to identify.
 * Object types don't need icons since they're embedded, not navigated to.
 */
export const missingIcon: SchemaRule = {
  id: 'missing-icon',
  name: 'Missing icon',
  description: 'Document types should have an icon',
  severity: 'warning',
  category: 'style',

  check(schema, context) {
    // Only applies to document types - icons appear in Studio navigation
    // Object types are embedded and don't appear in navigation, so don't need icons
    if (schema.type !== 'document') {
      return
    }

    if (!schema.hasIcon) {
      context.report({
        message: `Document type "${schema.name}" should have an icon`,
        severity: 'warning',
        ...(schema.span && { span: schema.span }),
        help: 'Add an icon from @sanity/icons: icon: DocumentIcon',
      })
    }
  },
}
