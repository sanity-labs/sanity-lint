import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

const ARITHMETIC_OPS = ['+', '-', '*', '/']

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
 * Check if a node is a literal (Value, Parameter, now(), or arithmetic on literals)
 */
function isLiteral(node: ExprNode): boolean {
  if (node.type === 'Value') return true
  if (node.type === 'Parameter') return true
  if (node.type === 'FuncCall' && node.name === 'now') return true

  // Arithmetic on literals is still a literal
  if (node.type === 'OpCall') {
    const op = (node as { op?: string }).op
    if (ARITHMETIC_OPS.includes(op ?? '')) {
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
 * Check if a node is an arithmetic operation
 */
function isArithmeticOp(
  node: ExprNode
): node is ExprNode & { op: string; left: ExprNode; right: ExprNode } {
  return node.type === 'OpCall' && ARITHMETIC_OPS.includes((node as { op?: string }).op ?? '')
}

/**
 * Rule: computed-value-in-filter
 *
 * Detects arithmetic operators (+, -, *, /) inside filter expressions,
 * unless one side references a parent scope (^).
 */
export const computedValueInFilter: Rule = {
  id: 'computed-value-in-filter',
  name: 'Computed Value in Filter',
  description: 'Avoid computed values in filters. Indices cannot be used.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node, walkContext) => {
      // Only check inside filters
      if (!walkContext.inFilter) return

      if (isArithmeticOp(node)) {
        // Exempt if either side contains a parent reference
        if (containsParentRef(node.left) || containsParentRef(node.right)) {
          return
        }

        // Exempt if both sides are literals (computed at query time, not per-document)
        if (isLiteral(node.left) && isLiteral(node.right)) {
          return
        }

        context.report({
          message: `Arithmetic operation '${node.op}' in filter prevents index usage.`,
          severity: 'warning',
          help: 'Consider pre-computing values or adding additional filters to reduce the search space.',
        })
      }
    })
  },
}
