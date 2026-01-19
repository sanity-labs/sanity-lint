import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Check if an expression tree contains a Parent reference (^)
 */
function containsParentRef(node: ExprNode): boolean {
  let found = false
  walk(node, (n) => {
    if (n.type === 'Parent') {
      found = true
    }
  })
  return found
}

/**
 * Rule: count-in-correlated-subquery
 *
 * Detects count() calls on correlated subqueries, which don't execute
 * as efficient aggregations.
 */
export const countInCorrelatedSubquery: Rule = {
  id: 'count-in-correlated-subquery',
  name: 'Count in Correlated Subquery',
  description: 'count() on correlated subquery can be slow.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'FuncCall') {
        const name = node.name as string
        if (name !== 'count') return

        const args = (node as { args?: ExprNode[] }).args ?? []
        if (args.length !== 1) return

        const arg = args[0]
        if (!arg) return

        // Check if the argument is a filter with a parent reference
        if (arg.type === 'Filter') {
          if (containsParentRef(arg as ExprNode)) {
            context.report({
              message:
                'count() on correlated subquery does not execute as an efficient aggregation.',
              severity: 'info',
              help: 'This pattern may be slow on large datasets. Consider restructuring the query.',
            })
          }
        }
      }
    })
  },
}
