import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

const COMPARISON_OPS = ['==', '!=', '<', '>', '<=', '>=']

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
 * Check if a node is a "literal" for purposes of this rule.
 * Literals include: Value, Parameter, now()
 */
function isLiteral(node: ExprNode): boolean {
  if (node.type === 'Value') return true
  if (node.type === 'Parameter') return true

  // now() is considered a literal (computed at query time, not per-document)
  if (node.type === 'FuncCall' && node.name === 'now') return true

  // Arithmetic on literals is still a literal (e.g., 2+1)
  if (node.type === 'OpCall') {
    const op = (node as { op?: string }).op
    if (['+', '-', '*', '/'].includes(op ?? '')) {
      const left = (node as { left?: ExprNode }).left
      const right = (node as { right?: ExprNode }).right
      if (left && right && isLiteral(left) && isLiteral(right)) {
        return true
      }
    }
  }

  return false
}

/**
 * Rule: non-literal-comparison
 *
 * Detects comparisons where both sides are non-literal expressions,
 * which cannot use indices efficiently.
 */
export const nonLiteralComparison: Rule = {
  id: 'non-literal-comparison',
  name: 'Non-Literal Comparison',
  description: 'Comparisons between two non-literal fields are slow.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node, walkContext) => {
      // Only check inside filters
      if (!walkContext.inFilter) return

      if (node.type === 'OpCall') {
        const op = (node as { op?: string }).op
        if (!COMPARISON_OPS.includes(op ?? '')) return

        const left = (node as { left?: ExprNode }).left
        const right = (node as { right?: ExprNode }).right

        if (!left || !right) return

        // Exempt if either side references parent scope
        if (containsParentRef(left) || containsParentRef(right)) return

        // Flag if both sides are non-literals
        if (!isLiteral(left) && !isLiteral(right)) {
          context.report({
            message: 'Comparing two non-literal expressions prevents efficient index usage.',
            severity: 'warning',
            help: 'Consider adding additional filters to reduce the search space.',
          })
        }
      }
    })
  },
}
