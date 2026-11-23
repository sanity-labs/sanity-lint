/**
 * Rule: unknown-field
 *
 * Detects when a query projects a field that doesn't exist in the schema
 * for the document type being queried. This catches typos like `{ titel }`
 * when you meant `{ title }`.
 *
 * This rule requires a schema to function. Without a schema, it is skipped.
 */

import type { Rule, RuleContext, Suggestion } from '@sanity-labs/lint-core'
import type { ExprNode, ObjectNode, SchemaType } from 'groq-js'
import { walk } from '../walker'

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  if (m === 0) {
    return n
  }
  if (n === 0) {
    return m
  }

  let prevRow = new Array<number>(n + 1)
  let currRow = new Array<number>(n + 1)

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (currRow[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + cost
      )
    }

    ;[prevRow, currRow] = [currRow, prevRow]
  }

  return prevRow[n] ?? 0
}

/**
 * Find similar field names from a list
 */
function findSimilarFields(
  fieldName: string,
  availableFields: Array<string>,
  maxDistance = 3
): Array<string> {
  return availableFields
    .flatMap((field) => {
      const distance = levenshteinDistance(fieldName.toLowerCase(), field.toLowerCase())
      return distance <= maxDistance && distance > 0 ? [{ field, distance }] : []
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((f) => f.field)
}

/**
 * Extract document type from a filter constraint
 * Returns the type name if found, null otherwise
 */
function extractTypeFromFilter(node: ExprNode): string | null {
  if (node.type === 'OpCall') {
    const opNode = node
    if (opNode.op !== '==') {
      return null
    }

    const { left, right } = opNode

    // Check _type == "value"
    if (
      left.type === 'AccessAttribute' &&
      left.name === '_type' &&
      right.type === 'Value' &&
      typeof right.value === 'string'
    ) {
      return right.value
    }

    // Check "value" == _type
    if (
      right.type === 'AccessAttribute' &&
      right.name === '_type' &&
      left.type === 'Value' &&
      typeof left.value === 'string'
    ) {
      return left.value
    }
  }

  // Check for And conditions: _type == "post" && ...
  if (node.type === 'And') {
    const leftType = extractTypeFromFilter(node.left)
    if (leftType) {
      return leftType
    }
    return extractTypeFromFilter(node.right)
  }

  return null
}

/**
 * Find the document type by examining a Filter node
 */
function findDocumentTypeFromFilter(filterBase: ExprNode): string | null {
  if (filterBase.type === 'Filter') {
    return extractTypeFromFilter(filterBase.expr)
  }
  return null
}

/**
 * Get field names for a document type from schema
 */
function getFieldsForType(schema: SchemaType, typeName: string): Array<string> {
  const doc = schema.find((item) => item.type === 'document' && item.name === typeName)
  if (doc?.type !== 'document') {
    return []
  }
  return Object.keys(doc.attributes)
}

/**
 * Built-in Sanity fields that exist on all documents
 */
const BUILT_IN_FIELDS = new Set(['_id', '_type', '_rev', '_createdAt', '_updatedAt'])

/**
 * Check fields in an Object node against schema
 */
function checkObjectFields(
  objNode: ObjectNode,
  documentType: string,
  availableFieldsSet: Set<string>,
  schemaFields: Array<string>,
  context: RuleContext
): void {
  for (const attr of objNode.attributes) {
    if (attr.type === 'ObjectAttributeValue') {
      // Get the field being accessed
      const value = attr.value
      if (value.type === 'AccessAttribute' && !value.base) {
        const fieldName = value.name

        // Skip if it's a known field
        if (availableFieldsSet.has(fieldName)) {
          continue
        }

        // Unknown field - report it
        const similarFields = findSimilarFields(fieldName, [...availableFieldsSet])

        const suggestions: Array<Suggestion> = similarFields.map((f) => ({
          description: `Change to "${f}"`,
          replacement: f,
        }))

        context.report({
          message: `Field "${fieldName}" does not exist on type "${documentType}"`,
          severity: 'warning',
          help:
            similarFields.length > 0
              ? `Did you mean: ${similarFields.map((f) => `"${f}"`).join(', ')}?`
              : `Available fields: ${schemaFields.slice(0, 5).join(', ')}${schemaFields.length > 5 ? '...' : ''}`,
          suggestions,
        })
      }
    }
  }
}

export const unknownField: Rule = {
  id: 'unknown-field',
  name: 'Unknown Field',
  description: 'Field in projection does not exist in schema',
  severity: 'warning',
  category: 'correctness',
  requiresSchema: true,

  check(ast, context) {
    const { schema } = context
    if (!schema) {
      return
    }

    walk(ast, (node) => {
      // Handle Map nodes: *[_type == "post"]{ title }
      // AST structure: Map { base: Filter, expr: Projection { base: This, expr: Object } }
      if (node.type === 'Map') {
        const mapNode = node
        const documentType = findDocumentTypeFromFilter(mapNode.base)
        if (!documentType) {
          return
        }

        // The expr should be a Projection
        if (mapNode.expr.type !== 'Projection') {
          return
        }
        const projection = mapNode.expr

        // The projection's expr should be an Object
        if (projection.expr.type !== 'Object') {
          return
        }
        const objNode = projection.expr

        // Get available fields for this type
        const schemaFields = getFieldsForType(schema, documentType)
        if (schemaFields.length === 0) {
          return
        }

        const availableFields = [...schemaFields, ...BUILT_IN_FIELDS]
        const availableFieldsSet = new Set(availableFields)

        checkObjectFields(objNode, documentType, availableFieldsSet, schemaFields, context)
      }
    })
  },
}
