import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'
import { isDocumentStream } from './query-plan'

/**
 * Rule: deep-pagination-param
 *
 * Detects slices and element accesses of a document stream where the start
 * index is a parameter, which could cause deep pagination if given a large
 * value.
 *
 * NOTE: groq-js does not support parameters in slice expressions
 * (throws "slicing must use constant numbers"), and parses `[$start]` as a
 * filter whose condition is the parameter. The slice check is kept for other
 * parsers that support this syntax.
 */
export const deepPaginationParam: Rule = {
  id: 'deep-pagination-param',
  name: 'Deep Pagination Parameter',
  description: 'Slice offset uses a parameter which could cause deep pagination.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      let start: unknown
      if (node.type === 'Slice' && isDocumentStream(node.base)) {
        start = node.left
      } else if (node.type === 'Filter' && isDocumentStream(node.base)) {
        start = node.expr
      }
      if (
        typeof start === 'object' &&
        start !== null &&
        'type' in start &&
        start.type === 'Parameter' &&
        'name' in start &&
        typeof start.name === 'string'
      ) {
        context.report({
          message: `Slice offset uses parameter $${start.name}. If given a large value, this will cause slow deep pagination.`,
          severity: 'info',
          help: 'Consider using cursor-based pagination with _id instead, or validate the parameter value.',
        })
      }
    })
  },
}
