import type { Rule } from '@sanity-labs/lint-core'
import type { ExprNode } from 'groq-js'
import { walk } from '../walker'
import { containsParentRef, enclosingFilters } from './query-plan'

const ARITHMETIC_OPS = new Set(['+', '-', '*', '/'])

/**
 * Functions the planner evaluates in memory for every candidate document.
 * Functions the index evaluates itself, such as `lower()`, `dateTime()`,
 * `string::startsWith()`, `references()` or `count(arr)`, are not listed.
 */
const IN_MEMORY_FUNCTIONS = new Set(['upper', 'length', 'round', 'coalesce'])

/**
 * Check if a node is a literal (Value, Parameter, now(), or arithmetic on literals)
 */
function isLiteral(node: ExprNode): boolean {
  if (node.type === 'Value') {
    return true
  }
  if (node.type === 'Parameter') {
    return true
  }
  if (node.type === 'FuncCall' && node.name === 'now') {
    return true
  }

  // Arithmetic on literals is still a literal
  if (node.type === 'OpCall') {
    const op = (node as { op?: string }).op
    if (ARITHMETIC_OPS.has(op ?? '')) {
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
  return node.type === 'OpCall' && ARITHMETIC_OPS.has((node as { op?: string }).op ?? '')
}

function accessesElement(node: ExprNode): boolean {
  if (node.type === 'AccessElement') {
    return true
  }
  return node.type === 'AccessAttribute' && node.base !== undefined && accessesElement(node.base)
}

/**
 * Describe `node` if the planner evaluates it in memory
 */
function inMemoryTerm(node: ExprNode): string | undefined {
  if (node.type === 'Select') {
    return '`select()`'
  }
  if (node.type === 'FuncCall' && node.namespace === 'global') {
    if (IN_MEMORY_FUNCTIONS.has(node.name)) {
      return `\`${node.name}()\``
    }
    const arg = node.args[0]
    if (node.name === 'defined' && node.args.length === 1 && arg && accessesElement(arg)) {
      return '`defined()` of an array element'
    }
  }
  if (
    node.type === 'AccessElement' &&
    node.base.type === 'FuncCall' &&
    node.base.namespace === 'string' &&
    node.base.name === 'split'
  ) {
    return 'An element of `string::split()`'
  }
  return undefined
}

/**
 * Rule: computed-value-in-filter
 *
 * Detects arithmetic operators (+, -, *, /) inside filter expressions,
 * unless one side references a parent scope (^). Also detects function calls
 * in a dataset filter that are evaluated in memory: `upper()`, `length()`,
 * `round()`, `coalesce()`, `select()`, `string::split(...)[i]` and
 * `defined(arr[i])`.
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
      if (!walkContext.inFilter) {
        return
      }

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
        return
      }

      const term = inMemoryTerm(node)
      if (
        term &&
        enclosingFilters(node, walkContext.parents)[0]?.base.type === 'Everything' &&
        !containsParentRef(node)
      ) {
        context.report({
          message: `${term} in filter is evaluated in memory for every candidate document.`,
          severity: 'warning',
          help: 'Consider pre-computing the value into a field or adding additional filters to reduce the search space.',
        })
      }
    })
  },
}
