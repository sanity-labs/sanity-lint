import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

/**
 * Rule: deep-pagination-param
 *
 * Detects slice expressions where the start index is a parameter,
 * which could potentially cause deep pagination if given a large value.
 *
 * NOTE: groq-js does not support parameters in slice expressions
 * (throws "slicing must use constant numbers"). This rule is included
 * for compatibility with other parsers that may support this syntax.
 */
export const deepPaginationParam: Rule = {
  id: 'deep-pagination-param',
  name: 'Deep Pagination Parameter',
  description: 'Slice offset uses a parameter which could cause deep pagination.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'Slice') {
        // In groq-js, left is always a number (or undefined).
        // This check is for future parser compatibility where left might be a Parameter node.
        const left: unknown = node.left
        if (
          typeof left === 'object' &&
          left !== null &&
          'type' in left &&
          left.type === 'Parameter' &&
          'name' in left &&
          typeof left.name === 'string'
        ) {
          context.report({
            message: `Slice offset uses parameter $${left.name}. If given a large value, this will cause slow deep pagination.`,
            severity: 'info',
            help: 'Consider using cursor-based pagination with _id instead, or validate the parameter value.',
          })
        }
      }
    })
  },
}
