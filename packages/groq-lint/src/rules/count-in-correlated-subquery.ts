import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'
import { containsParentRef, isDocumentStream } from './query-plan'

function conjuncts(node: ExprNode): Array<ExprNode> {
  if (node.type === 'And') {
    return [...conjuncts(node.left), ...conjuncts(node.right)]
  }
  if (node.type === 'Group') {
    return conjuncts(node.base)
  }
  return [node]
}

/**
 * `x == ^.y` (with `^` on exactly one side) or `references(^.y)`
 */
function isBatchKey(node: ExprNode): boolean {
  if (node.type === 'OpCall' && node.op === '==') {
    return containsParentRef(node.left) !== containsParentRef(node.right)
  }
  return node.type === 'FuncCall' && node.name === 'references'
}

/**
 * Whether a document filter in `node` has a `^` condition that cannot be batched
 */
function hasUnbatchedCorrelation(node: ExprNode): boolean {
  let found = false
  walk(node, (n) => {
    if (n.type === 'Filter' && isDocumentStream(n.base)) {
      if (conjuncts(n.expr).some((term) => containsParentRef(term) && !isBatchKey(term))) {
        found = true
      }
    }
  })
  return found
}

/**
 * Rule: count-in-correlated-subquery
 *
 * Detects count() on a correlated subquery whose `^` condition is not an
 * equality or `references()`. Equalities and `references()` are batched into
 * one index read keyed on the parent value. Other conditions (`>`, `<`, `in`,
 * `match`, ...) read every document matched by the rest of the subquery, then
 * filter that batch in memory for each row.
 */
export const countInCorrelatedSubquery: Rule = {
  id: 'count-in-correlated-subquery',
  name: 'Count in Correlated Subquery',
  description: 'count() on correlated subquery can be slow.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type !== 'FuncCall' || node.name !== 'count' || node.args.length !== 1) {
        return
      }
      const arg = node.args[0]
      if (arg && hasUnbatchedCorrelation(arg)) {
        context.report({
          message:
            'count() on a correlated subquery whose `^` condition is not an equality or `references()` can be slow.',
          severity: 'info',
          help: 'Every document matched by the rest of the subquery is read, then filtered in memory for each row. Compare with `==` against `^` or use `references(^._id)` so the subquery is batched.',
        })
      }
    })
  },
}
