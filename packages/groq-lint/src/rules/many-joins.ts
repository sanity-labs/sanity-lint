import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

const MAX_JOINS = 10

/**
 * Rule: many-joins
 *
 * Detects queries with more than 10 dereference operators (->).
 */
export const manyJoins: Rule = {
  id: 'many-joins',
  name: 'Many Joins',
  description: 'This query uses many joins and may have poor performance.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    let joinCount = 0

    walk(ast, (node) => {
      if (node.type === 'Deref') {
        joinCount++
      }
    })

    if (joinCount > MAX_JOINS) {
      context.report({
        message: `This query uses ${joinCount} joins (->), which may cause poor performance.`,
        severity: 'warning',
        help: 'Consider denormalizing data, using fewer reference expansions, or splitting into multiple queries.',
      })
    }
  },
}
