import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

const MAX_JOINS = 10

/**
 * A key for the reference being joined, or `undefined` when the path is
 * computed and each join must count on its own.
 */
function referencePath(node: ExprNode): string | undefined {
  switch (node.type) {
    case 'This':
      return '@'
    case 'Parent':
      return '^'.repeat(node.n)
    case 'AccessAttribute': {
      const base = node.base ? referencePath(node.base) : '@'
      return base === undefined ? undefined : `${base}.${node.name}`
    }
    case 'Deref': {
      const base = referencePath(node.base)
      return base === undefined ? undefined : `${base}->`
    }
    case 'ArrayCoerce': {
      const base = referencePath(node.base)
      return base === undefined ? undefined : `${base}[]`
    }
    case 'AccessElement': {
      const base = referencePath(node.base)
      return base === undefined ? undefined : `${base}[${node.index}]`
    }
    default:
      return undefined
  }
}

/**
 * Rule: many-joins
 *
 * Detects queries with more than 10 distinct joins. Joins on the same
 * reference within a projection or filter (`author->name` repeated in several
 * fields) are merged into one resolve and count once.
 */
export const manyJoins: Rule = {
  id: 'many-joins',
  name: 'Many Joins',
  description: 'This query uses many joins and may have poor performance.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    const scopes = new Map<ExprNode | undefined, Set<string | ExprNode>>()

    walk(ast, (node, walkContext) => {
      if (node.type !== 'Deref') {
        return
      }
      const scope = [...walkContext.parents]
        .reverse()
        .find((parent) => parent.type === 'Projection' || parent.type === 'Filter')
      const joins = scopes.get(scope) ?? new Set()
      joins.add(referencePath(node.base) ?? node)
      scopes.set(scope, joins)
    })

    let joinCount = 0
    for (const joins of scopes.values()) {
      joinCount += joins.size
    }

    if (joinCount > MAX_JOINS) {
      context.report({
        message: `This query uses ${joinCount} distinct joins (->), which may cause poor performance.`,
        severity: 'warning',
        help: 'Consider denormalizing data, using fewer reference expansions, or splitting into multiple queries.',
      })
    }
  },
}
