import type { ExprNode } from 'groq-js'

/**
 * Context passed to visitor functions
 */
export interface WalkContext {
  /** Whether we're currently inside a filter constraint */
  inFilter: boolean
  /** Whether we're currently inside a projection */
  inProjection: boolean
  /** Parent node stack */
  parents: Array<ExprNode>
}

/**
 * Visitor function called for each node
 */
export type Visitor = (node: ExprNode, context: WalkContext) => void

/**
 * Walk the AST and call visitor for each node
 *
 * @param node - The root AST node
 * @param visitor - Function called for each node
 * @param context - Initial context (defaults to not in filter/projection)
 */
export function walk(
  node: ExprNode,
  visitor: Visitor,
  context: WalkContext = { inFilter: false, inProjection: false, parents: [] }
): void {
  // Call visitor for current node
  visitor(node, context)

  // Build context for children
  const childContext: WalkContext = {
    ...context,
    parents: [...context.parents, node],
  }

  // Recursively walk children based on node type
  switch (node.type) {
    case 'Filter': {
      // Walk base with current context
      walk(node.base, visitor, childContext)
      // Walk constraint with inFilter = true
      walk(node.expr, visitor, { ...childContext, inFilter: true })
      break
    }

    case 'Projection': {
      // Walk base with current context
      walk(node.base, visitor, childContext)
      // Walk projection expression with inProjection = true
      walk(node.expr, visitor, { ...childContext, inProjection: true })
      break
    }

    case 'And':
    case 'Or':
    case 'OpCall': {
      walk(node.left, visitor, childContext)
      walk(node.right, visitor, childContext)
      break
    }

    case 'Not':
    case 'Neg':
    case 'Pos':
    case 'Asc':
    case 'Desc':
    case 'Group': {
      walk(node.base, visitor, childContext)
      break
    }

    case 'Deref': {
      walk(node.base, visitor, childContext)
      break
    }

    case 'AccessAttribute': {
      if (node.base) {
        walk(node.base, visitor, childContext)
      }
      break
    }

    case 'AccessElement': {
      walk(node.base, visitor, childContext)
      break
    }

    case 'Slice': {
      walk(node.base, visitor, childContext)
      break
    }

    case 'ArrayCoerce': {
      walk(node.base, visitor, childContext)
      break
    }

    case 'FlatMap':
    case 'Map': {
      walk(node.base, visitor, childContext)
      walk(node.expr, visitor, childContext)
      break
    }

    case 'Array': {
      for (const element of node.elements) {
        walk(element.value, visitor, childContext)
      }
      break
    }

    case 'Object': {
      for (const attr of node.attributes) {
        if (attr.type === 'ObjectAttributeValue') {
          walk(attr.value, visitor, childContext)
        } else if (attr.type === 'ObjectConditionalSplat') {
          walk(attr.condition, visitor, childContext)
          walk(attr.value, visitor, childContext)
        } else if (attr.type === 'ObjectSplat') {
          walk(attr.value, visitor, childContext)
        }
      }
      break
    }

    case 'FuncCall': {
      for (const arg of node.args) {
        walk(arg, visitor, childContext)
      }
      break
    }

    case 'PipeFuncCall': {
      walk(node.base, visitor, childContext)
      for (const arg of node.args) {
        walk(arg, visitor, childContext)
      }
      break
    }

    case 'Select': {
      for (const alt of node.alternatives) {
        walk(alt.condition, visitor, childContext)
        walk(alt.value, visitor, childContext)
      }
      if (node.fallback) {
        walk(node.fallback, visitor, childContext)
      }
      break
    }

    case 'InRange': {
      walk(node.base, visitor, childContext)
      walk(node.left, visitor, childContext)
      walk(node.right, visitor, childContext)
      break
    }

    case 'Tuple': {
      for (const member of node.members) {
        walk(member, visitor, childContext)
      }
      break
    }

    // Leaf nodes - no children to walk
    case 'Everything':
    case 'This':
    case 'Parent':
    case 'Value':
    case 'Parameter':
    case 'Context':
      break

    default: {
      // For any unhandled node types, do nothing
      // This makes the walker forward-compatible with new node types
      break
    }
  }
}
