import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Rule: match-on-id
 *
 * Detects using the `match` operator on `_id`, which may not work as expected
 * because `match` is designed for full-text matching.
 */
export const matchOnId: Rule = {
  id: 'match-on-id',
  name: 'Match on ID',
  description: '`match` on `_id` may not work as expected.',
  severity: 'info',
  category: 'correctness',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'OpCall') {
        const op = (node as { op?: string }).op
        if (op !== 'match') return

        const left = (node as { left?: ExprNode }).left

        // Check if left side is an AccessAttribute for _id
        if (left && left.type === 'AccessAttribute') {
          const name = (left as { name?: string }).name
          if (name === '_id') {
            context.report({
              message:
                '`match` is designed for full-text matching and may not work as expected on `_id`.',
              severity: 'info',
              help: 'Consider using `==` for exact matches or `string::startsWith()` for prefix matching.',
            })
          }
        }
      }
    })
  },
}
