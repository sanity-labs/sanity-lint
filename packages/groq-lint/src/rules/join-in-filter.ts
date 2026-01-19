import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

/**
 * Rule: join-in-filter
 *
 * Detects dereference operators (->) inside filter constraints.
 * This is a performance anti-pattern because it prevents query optimization.
 *
 * Bad:  *[author->name == "Bob"]
 * Good: *[_type == "post" && author._ref == $authorId]
 */
export const joinInFilter: Rule = {
  id: 'join-in-filter',
  name: 'Join in Filter',
  description: 'Avoid `->` inside filters. It prevents optimization.',
  severity: 'error',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node, walkContext) => {
      // Only check Deref nodes that are inside a filter
      if (node.type === 'Deref' && walkContext.inFilter) {
        context.report({
          message: 'Avoid joins (`->`) inside filters. It prevents optimization.',
          severity: 'error',
          help: 'Use `field._ref == $id` instead of `field->attr == "value"`',
          // Note: groq-js doesn't expose source positions, so we omit span
          // In a future version, we might add position tracking
        })
      }
    })
  },
}
