import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Check if an expression tree contains a Parent reference (^)
 */
export function containsParentRef(node: ExprNode): boolean {
  let found = false
  walk(node, (n) => {
    if (n.type === 'Parent') {
      found = true
    }
  })
  return found
}

/**
 * Whether `node` evaluates to documents read from the dataset (`*`, possibly
 * filtered, projected, ordered or sliced), as opposed to an attribute of one
 * document. Slicing or filtering an attribute array happens in memory.
 */
export function isDocumentStream(node: ExprNode): boolean {
  switch (node.type) {
    case 'Everything':
      return true
    case 'Filter':
    case 'Map':
    case 'Projection':
    case 'Slice':
    case 'ArrayCoerce':
    case 'PipeFuncCall':
    case 'Group':
      return isDocumentStream(node.base)
    default:
      return false
  }
}

/**
 * The filters enclosing the last node of `parents`, innermost first, stopping
 * at the nearest projection.
 */
export function enclosingFilters(
  node: ExprNode,
  parents: Array<ExprNode>
): Array<Extract<ExprNode, { type: 'Filter' }>> {
  const filters: Array<Extract<ExprNode, { type: 'Filter' }>> = []
  let child = node
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i]
    if (!parent) {
      break
    }
    if (parent.type === 'Projection' && parent.expr === child) {
      break
    }
    if (parent.type === 'Filter' && parent.expr === child) {
      filters.push(parent)
    }
    child = parent
  }
  return filters
}
