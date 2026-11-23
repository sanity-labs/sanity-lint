import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'
import { isDocumentStream } from './query-plan'

const DEEP_PAGINATION_THRESHOLD = 1000

/**
 * Rule: deep-pagination
 *
 * Detects slices and element accesses of a document stream where the start
 * index is >= 1000, which causes slow queries due to offset-based pagination.
 * Slices of one document's attribute array are taken in memory and are not
 * pagination.
 */
export const deepPagination: Rule = {
  id: 'deep-pagination',
  name: 'Deep Pagination',
  description: 'Deep pagination with large offsets is slow.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      let start: number | undefined
      if (node.type === 'Slice' && isDocumentStream(node.base)) {
        // In groq-js, left is a direct number (or undefined for [0...N])
        start = node.left as number | undefined
      } else if (node.type === 'AccessElement' && isDocumentStream(node.base)) {
        start = node.index
      }
      if (typeof start === 'number' && start >= DEEP_PAGINATION_THRESHOLD) {
        context.report({
          message: `Slice offset of ${start} is deep pagination. This is slow because all skipped documents must be sorted first.`,
          severity: 'warning',
          help: 'Use cursor-based pagination with _id instead (e.g., `*[_type == "post" && _id > $lastId] | order(_id)[0...20]`).',
        })
      }
    })
  },
}
