import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Get the base attribute name from a dereference chain.
 * e.g., author->name returns "author"
 */
function getDerefBaseName(node: ExprNode): string | null {
  if (node.type !== 'Deref') {
    return null
  }

  const base = (node as { base?: ExprNode }).base
  if (!base) {
    return null
  }

  // Walk down to find the root AccessAttribute
  let current = base
  while (current.type === 'AccessAttribute' && (current as { base?: ExprNode }).base) {
    current = (current as { base: ExprNode }).base
  }

  if (current.type === 'AccessAttribute') {
    return (current as { name?: string }).name ?? null
  }

  return null
}

const SCOPED_NODE_TYPES = new Set(['Projection', 'Map', 'FlatMap', 'Filter'])

/**
 * Whether `node` is evaluated against another value than the projection the walk started in:
 * inside a nested projection, a `[]` map, or a filter, where `asset` names another object's field.
 */
function inNestedScope(node: ExprNode, parents: Array<ExprNode>): boolean {
  return parents.some(
    (parent, index) =>
      SCOPED_NODE_TYPES.has(parent.type) &&
      (parent as { expr?: ExprNode }).expr === (parents[index + 1] ?? node)
  )
}

/**
 * Rule: repeated-dereference
 *
 * Detects multiple dereference operations on the same attribute
 * within a single projection. Nested projections count on their own.
 */
export const repeatedDereference: Rule = {
  id: 'repeated-dereference',
  name: 'Repeated Dereference',
  description: 'Repeatedly resolving the same reference is inefficient.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node, _walkContext) => {
      // Only check Projection nodes
      if (node.type !== 'Projection') {
        return
      }

      const projectionExpr = (node as { expr?: ExprNode }).expr
      if (!projectionExpr) {
        return
      }

      // Track dereferenced attributes in this projection
      const derefCounts = new Map<string, number>()

      walk(projectionExpr, (innerNode, { parents }) => {
        if (innerNode.type === 'Deref' && !inNestedScope(innerNode, parents)) {
          const baseName = getDerefBaseName(innerNode)
          if (baseName) {
            derefCounts.set(baseName, (derefCounts.get(baseName) ?? 0) + 1)
          }
        }
      })

      // Report any repeated dereferences
      for (const [name, count] of derefCounts) {
        if (count > 1) {
          context.report({
            message: `Reference '${name}' is dereferenced ${count} times. Consider a single sub-projection.`,
            severity: 'info',
            help: `Replace multiple '${name}->...' with '${name}->{ ... }' to resolve the reference once.`,
          })
        }
      }
    })
  },
}
