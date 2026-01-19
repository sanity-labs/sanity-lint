import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

const DEEP_PAGINATION_THRESHOLD = 1000

/**
 * Rule: deep-pagination
 *
 * Detects slice expressions where the start index is >= 1000,
 * which causes slow queries due to offset-based pagination.
 */
export const deepPagination: Rule = {
  id: 'deep-pagination',
  name: 'Deep Pagination',
  description: 'Deep pagination with large offsets is slow.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'Slice') {
        // In groq-js, left is a direct number (or undefined for [0...N])
        const left = node.left as number | undefined
        if (typeof left === 'number' && left >= DEEP_PAGINATION_THRESHOLD) {
          context.report({
            message: `Slice offset of ${left} is deep pagination. This is slow because all skipped documents must be sorted first.`,
            severity: 'warning',
            help: 'Use cursor-based pagination with _id instead (e.g., `*[_type == "post" && _id > $lastId] | order(_id)[0...20]`).',
          })
        }
      }
    })
  },
}
