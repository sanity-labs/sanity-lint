import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Check if a node is a simple attribute (can use index for sorting)
 */
function isSimpleAttribute(node: ExprNode): boolean {
  return node.type === 'AccessAttribute'
}

/**
 * Check if a node is an allowed wrapped attribute:
 * - lower(attribute)
 * - dateTime(attribute)
 * - geo::distance(attribute, constant)
 */
function isAllowedWrappedAttribute(node: ExprNode): boolean {
  if (node.type !== 'FuncCall') return false

  const name = node.name as string
  const namespace = (node as { namespace?: string }).namespace
  const args = (node as { args?: ExprNode[] }).args ?? []

  // lower(attribute)
  if (name === 'lower' && namespace === 'global' && args.length === 1) {
    const arg = args[0]
    return arg !== undefined && isSimpleAttribute(arg)
  }

  // dateTime(attribute)
  if (name === 'dateTime' && namespace === 'global' && args.length === 1) {
    const arg = args[0]
    return arg !== undefined && isSimpleAttribute(arg)
  }

  // geo::distance(attribute, constant)
  if (name === 'distance' && namespace === 'geo' && args.length === 2) {
    const arg0 = args[0]
    const arg1 = args[1]
    return (
      arg0 !== undefined && arg1 !== undefined && isSimpleAttribute(arg0) && arg1.type === 'Value'
    )
  }

  return false
}

/**
 * Check if an order argument is valid (can use index)
 */
function isValidOrderArg(node: ExprNode): boolean {
  // Direct attribute access
  if (isSimpleAttribute(node)) return true

  // Allowed function wrappers
  if (isAllowedWrappedAttribute(node)) return true

  // Asc/Desc wrappers - check the base
  if (node.type === 'Asc' || node.type === 'Desc') {
    const base = (node as { base?: ExprNode }).base
    if (base) {
      return isSimpleAttribute(base) || isAllowedWrappedAttribute(base)
    }
  }

  return false
}

/**
 * Rule: order-on-expr
 *
 * Detects order() calls with computed expressions that can't use indices.
 */
export const orderOnExpr: Rule = {
  id: 'order-on-expr',
  name: 'Order on Expression',
  description: 'Ordering on computed values is slow.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'PipeFuncCall') {
        const name = (node as { name?: string }).name
        if (name !== 'order') return

        const args = (node as { args?: ExprNode[] }).args ?? []

        for (const arg of args) {
          if (!isValidOrderArg(arg)) {
            context.report({
              message: 'Ordering on computed expression prevents index usage.',
              severity: 'warning',
              help: 'Use simple attributes or allowed functions (lower, dateTime, geo::distance) for ordering.',
            })
          }
        }
      }
    })
  },
}
