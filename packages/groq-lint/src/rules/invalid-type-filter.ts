/**
 * Rule: invalid-type-filter
 *
 * Detects when a query filters by `_type == "someType"` where "someType"
 * doesn't exist in the schema. This catches typos like `_type == "psot"`
 * when you meant `_type == "post"`.
 *
 * Document filters (`*[...]`) are validated against document types. Filters on
 * arrays (e.g. `content[_type == "imageBlock"]`) are validated against the
 * member types allowed in that array. Comparisons whose context type cannot be
 * determined from the schema are skipped.
 *
 * This rule requires a schema to function. Without a schema, it is skipped.
 */

import type { Rule, Suggestion } from '@sanity-labs/lint-core'
import type { AccessAttributeNode, OpCallNode } from 'groq-js'
import { SchemaTypeResolver, walkScoped } from '../type-scope'

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
 * Check if an OpCallNode is a _type comparison
 */
function isTypeComparison(
  node: OpCallNode
): { typeName: string; typeAccess: AccessAttributeNode } | null {
  if (node.op !== '==') return null

  const { left, right } = node

  // Check _type == "value"
  if (
    left.type === 'AccessAttribute' &&
    left.name === '_type' &&
    right.type === 'Value' &&
    typeof right.value === 'string'
  ) {
    return { typeName: right.value, typeAccess: left }
  }

  // Check "value" == _type
  if (
    right.type === 'AccessAttribute' &&
    right.name === '_type' &&
    left.type === 'Value' &&
    typeof left.value === 'string'
  ) {
    return { typeName: left.value, typeAccess: right }
  }

  return null
}

function formatTypeList(types: string[]): string {
  return `${types
    .slice(0, 5)
    .map((t) => `"${t}"`)
    .join(', ')}${types.length > 5 ? '...' : ''}`
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

    const resolver = new SchemaTypeResolver(schema)
    const { documentTypes } = resolver
    const documentTypeSet = new Set(documentTypes)

    walkScoped(ast, resolver, (node, scope) => {
      if (node.type !== 'OpCall') return

      const typeComparison = isTypeComparison(node as OpCallNode)
      if (!typeComparison) return

      const { typeName, typeAccess } = typeComparison

      // Only validate when the possible types of the value whose `_type` is
      // compared are fully known; unknown contexts are skipped.
      const ownerType = typeAccess.base ? resolver.resolve(typeAccess.base, scope) : scope.type
      const possibleTypes = ownerType && resolver.possibleTypeNames(ownerType)
      if (!possibleTypes || possibleTypes.includes(typeName)) return

      if (!documentTypeSet.has(typeName) && possibleTypes.every((t) => documentTypeSet.has(t))) {
        const similarTypes = findSimilarTypes(typeName, documentTypes)

        context.report({
          message: `Document type "${typeName}" does not exist in schema`,
          severity: 'error',
          help:
            similarTypes.length > 0
              ? `Did you mean: ${similarTypes.map((t) => `"${t}"`).join(', ')}?`
              : `Available types: ${documentTypes.slice(0, 5).join(', ')}${documentTypes.length > 5 ? '...' : ''}`,
          suggestions: toSuggestions(similarTypes),
        })
        return
      }

      const similarTypes = findSimilarTypes(typeName, possibleTypes)

      context.report({
        message: `Type "${typeName}" is not a possible type here`,
        severity: 'error',
        help:
          similarTypes.length > 0
            ? `Did you mean: ${similarTypes.map((t) => `"${t}"`).join(', ')}?`
            : `Possible types: ${formatTypeList(possibleTypes)}`,
        suggestions: toSuggestions(similarTypes),
      })
    })
  },
}

function toSuggestions(types: string[]): Suggestion[] {
  return types.map((t) => ({ description: `Change to "${t}"`, replacement: t }))
}
