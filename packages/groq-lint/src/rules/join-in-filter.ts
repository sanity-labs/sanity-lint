import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'
import { enclosingFilters, isDocumentStream } from './query-plan'

/**
 * Rule: join-in-filter
 *
 * Detects dereference operators (->) inside a filter over documents read from
 * the dataset. The join is resolved for every candidate document and the
 * filter runs in memory. Filters over one document's attribute array inside a
 * projection (`reviews[@->title == "x"]`) have no index read to lose.
 *
 * Bad:  *[author->name == "Bob"]
 * Good: *[_type == "post" && author._ref in *[_type == "author" && name == "Bob"]._id]
 */
export const joinInFilter: Rule = {
  id: 'join-in-filter',
  name: 'Join in Filter',
  description: 'Avoid `->` inside filters. It prevents optimization.',
  severity: 'error',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node, walkContext) => {
      if (node.type !== 'Deref' || !walkContext.inFilter) {
        return
      }
      if (!enclosingFilters(node, walkContext.parents).some((f) => isDocumentStream(f.base))) {
        return
      }
      context.report({
        message: 'Avoid joins (`->`) inside filters. It prevents optimization.',
        severity: 'error',
        help: 'Filter on the reference instead: `a->b == "c"` can be written `a._ref in *[b == "c"]._id`.',
        // Note: groq-js doesn't expose source positions, so we omit span
        // In a future version, we might add position tracking
      })
    })
  },
}
