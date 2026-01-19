/**
 * Rule: invalid-type-filter
 *
 * Detects when a query filters by `_type == "someType"` where "someType"
 * doesn't exist in the schema. This catches typos like `_type == "psot"`
 * when you meant `_type == "post"`.
 *
 * This rule requires a schema to function. Without a schema, it is skipped.
 */

import type { Rule, Suggestion } from '@sanity-labs/lint-core'
import type { OpCallNode } from 'groq-js'
import { walk } from '../walker'

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Edge cases
  if (m === 0) return n
  if (n === 0) return m

  // Use two rows instead of full matrix for efficiency
  let prevRow = new Array<number>(n + 1)
  let currRow = new Array<number>(n + 1)

  // Initialize first row
  for (let j = 0; j <= n; j++) {
    prevRow[j] = j
  }

  // Fill matrix row by row
  for (let i = 1; i <= m; i++) {
    currRow[0] = i

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1, // deletion
        (currRow[j - 1] ?? 0) + 1, // insertion
        (prevRow[j - 1] ?? 0) + cost // substitution
      )
    }

    // Swap rows
    ;[prevRow, currRow] = [currRow, prevRow]
  }

  return prevRow[n] ?? 0
}

/**
 * Find similar type names from the schema
 */
function findSimilarTypes(typeName: string, schemaTypes: string[], maxDistance = 3): string[] {
  return schemaTypes
    .map((t) => ({
      type: t,
      distance: levenshteinDistance(typeName.toLowerCase(), t.toLowerCase()),
    }))
    .filter((t) => t.distance <= maxDistance && t.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((t) => t.type)
}

/**
 * Extract document type names from schema
 */
function getSchemaDocumentTypes(schema: { type: string; name: string }[]): string[] {
  return schema.filter((item) => item.type === 'document').map((item) => item.name)
}

/**
 * Check if an OpCallNode is a _type comparison
 */
function isTypeComparison(node: OpCallNode): { typeName: string } | null {
  if (node.op !== '==') return null

  const { left, right } = node

  // Check _type == "value"
  if (
    left.type === 'AccessAttribute' &&
    left.name === '_type' &&
    right.type === 'Value' &&
    typeof right.value === 'string'
  ) {
    return { typeName: right.value }
  }

  // Check "value" == _type
  if (
    right.type === 'AccessAttribute' &&
    right.name === '_type' &&
    left.type === 'Value' &&
    typeof left.value === 'string'
  ) {
    return { typeName: left.value }
  }

  return null
}

export const invalidTypeFilter: Rule = {
  id: 'invalid-type-filter',
  name: 'Invalid Type Filter',
  description: 'Document type in filter does not exist in schema',
  severity: 'error',
  category: 'correctness',
  requiresSchema: true,

  check(ast, context) {
    const { schema } = context
    if (!schema) return // Schema required

    const documentTypes = getSchemaDocumentTypes(schema as { type: string; name: string }[])
    const documentTypeSet = new Set(documentTypes)

    walk(ast, (node) => {
      if (node.type !== 'OpCall') return

      const typeComparison = isTypeComparison(node as OpCallNode)
      if (!typeComparison) return

      const { typeName } = typeComparison

      // Check if the type exists in the schema
      if (!documentTypeSet.has(typeName)) {
        const similarTypes = findSimilarTypes(typeName, documentTypes)

        const suggestions: Suggestion[] = similarTypes.map((t) => ({
          description: `Change to "${t}"`,
          replacement: t,
        }))

        context.report({
          message: `Document type "${typeName}" does not exist in schema`,
          severity: 'error',
          help:
            similarTypes.length > 0
              ? `Did you mean: ${similarTypes.map((t) => `"${t}"`).join(', ')}?`
              : `Available types: ${documentTypes.slice(0, 5).join(', ')}${documentTypes.length > 5 ? '...' : ''}`,
          suggestions,
        })
      }
    })
  },
}
