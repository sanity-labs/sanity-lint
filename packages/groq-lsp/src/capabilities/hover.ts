/**
 * Hover capability for the GROQ Language Server
 *
 * Shows type information and documentation when hovering over GROQ elements
 */

import type { Hover, MarkupContent } from 'vscode-languageserver'
import { parse, typeEvaluate, type SchemaType } from 'groq-js'
import { type GroqFunction, withGroqFunctions } from '../content-mapper/functions.js'
import type { GroqQuery } from '../types.js'
import { formatType, type FormattedType } from './hover-format.js'
import {
  resolveCallType,
  resolveFieldType,
  resolveParamType,
  resolveStringLiteral,
} from './hover-types.js'

/**
 * Options for computing hover information
 */
export interface HoverOptions {
  /** Schema for type evaluation */
  schema?: SchemaType | undefined
  /** Shared custom GROQ functions, prepended to a query that calls them before it is parsed */
  functions?: Map<string, GroqFunction> | undefined
}

/**
 * Get hover information for a position in a GROQ query
 */
export function getHoverInfo(
  query: GroqQuery,
  positionInQuery: number,
  options: HoverOptions = {}
): Hover | null {
  try {
    // Read before parsing: groq-js cannot parse a slice with a parameter (`[0...$n]`).
    const param = resolveParamType(
      query.query,
      positionInQuery,
      options.schema && { schema: options.schema, functions: options.functions }
    )
    if (param) {
      const content = buildHoverContent(
        { type: 'parameter', text: `$${param.name}` },
        options.schema ? (param.type ?? { text: 'unknown', notes: [] }) : null
      )
      return content ? { contents: content } : null
    }

    const ast = parse(
      options.functions ? withGroqFunctions(query.query, options.functions) : query.query
    )

    const literal = resolveStringLiteral(
      query.query,
      positionInQuery,
      options.schema && { schema: options.schema, functions: options.functions }
    )
    if (literal) {
      const content =
        literal.key === undefined
          ? { kind: 'markdown' as const, value: ['```groq', literal.text, '```'].join('\n') }
          : buildHoverContent({ type: 'field', text: literal.key }, literal.keyType)
      return content ? { contents: content } : null
    }

    if (options.schema) {
      const call = resolveCallType(query.query, positionInQuery, {
        schema: options.schema,
        functions: options.functions,
      })
      const content = call
        ? buildHoverContent({ type: 'function', text: call.name }, call.type)
        : null
      if (content) {
        return { contents: content }
      }
    }

    // Find the node at the cursor position
    const nodeInfo = findNodeAtPosition(ast, positionInQuery, query.query)
    if (!nodeInfo) {
      return null
    }

    // Evaluate type if schema is available
    let typeInfo: FormattedType | null = null
    if (options.schema) {
      const fieldType = isFieldNode(nodeInfo)
        ? resolveFieldType(query.query, positionInQuery, {
            schema: options.schema,
            functions: options.functions,
          })
        : null
      if (fieldType) {
        typeInfo = fieldType
      } else {
        try {
          typeInfo = formatType(typeEvaluate(ast, options.schema), options.schema)
        } catch {
          // Type evaluation failed, continue without type info
        }
      }
    }

    // Build hover content
    const content = buildHoverContent(nodeInfo, typeInfo)
    if (!content) {
      return null
    }

    return {
      contents: content,
    }
  } catch {
    // Parse failed, no hover info
    return null
  }
}

/**
 * Information about a node at a position
 */
interface NodeInfo {
  type: string
  text: string
  documentation?: string
}

function isFieldNode(nodeInfo: NodeInfo): boolean {
  return nodeInfo.type === 'field' || nodeInfo.type === 'system-field' || nodeInfo.type === 'filter'
}

/**
 * Find the node at a given position in the query
 * Returns basic info about what's at that position
 */
function findNodeAtPosition(_ast: unknown, position: number, queryText: string): NodeInfo | null {
  // Extract the word/identifier at the position
  const { word, context } = extractWordAtPosition(queryText, position)

  if (!word) {
    return null
  }

  // Identify the type of element based on context
  if (context === 'filter' && word.startsWith('_type')) {
    return {
      type: 'filter',
      text: word,
      documentation: 'Filters documents by their type',
    }
  }

  if (word.startsWith('_')) {
    return {
      type: 'system-field',
      text: word,
      documentation: getSystemFieldDoc(word),
    }
  }

  if (word === '->') {
    return {
      type: 'dereference',
      text: '->',
      documentation: 'Dereferences a reference to fetch the referenced document',
    }
  }

  // Check if it's a GROQ function
  const funcDoc = getGroqFunctionDoc(word)
  if (funcDoc) {
    return {
      type: 'function',
      text: word,
      documentation: funcDoc,
    }
  }

  // Default to field access
  return {
    type: 'field',
    text: word,
  }
}

/**
 * Extract the word at a position and its context
 */
function extractWordAtPosition(text: string, position: number) {
  // Find word boundaries
  let start = position
  let end = position

  // Move start backwards to find word beginning
  while (start > 0 && isWordChar(text[start - 1])) {
    start--
  }

  // Move end forwards to find word end
  while (end < text.length && isWordChar(text[end])) {
    end++
  }

  const word = text.slice(start, end)

  // Determine context by looking at surrounding characters
  const before = text.slice(0, start).trim()
  let context = 'unknown'

  if (before.endsWith('[')) {
    context = 'filter'
  } else if (before.endsWith('{') || before.endsWith(',')) {
    context = 'projection'
  } else if (before.endsWith('->')) {
    context = 'dereference'
  }

  return { word: word || null, context }
}

/**
 * Check if a character is part of a word/identifier
 */
function isWordChar(char: string | undefined): boolean {
  if (!char) {
    return false
  }
  return /[a-zA-Z0-9_]/.test(char)
}

/**
 * Get documentation for system fields
 */
function getSystemFieldDoc(field: string): string {
  const docs = new Map<string, string>([
    ['_id', 'Unique document identifier'],
    ['_type', 'Document type name'],
    ['_rev', 'Document revision (changes on every update)'],
    ['_createdAt', 'Timestamp when the document was created'],
    ['_updatedAt', 'Timestamp when the document was last updated'],
    ['_key', 'Array item key (unique within the array)'],
    ['_ref', 'Reference target document ID'],
    ['_weak', 'Whether this is a weak reference'],
  ])

  return docs.get(field) ?? `System field: ${field}`
}

/**
 * Get documentation for GROQ functions
 */
function getGroqFunctionDoc(name: string): string | null {
  const docs = new Map<string, string>([
    ['count', 'count(array) - Returns the number of items in an array'],
    ['defined', 'defined(value) - Returns true if the value is not null'],
    ['coalesce', 'coalesce(a, b, ...) - Returns the first non-null value'],
    ['select', 'select(conditions) - Returns value based on conditions'],
    ['length', 'length(string|array) - Returns the length'],
    ['lower', 'lower(string) - Converts string to lowercase'],
    ['upper', 'upper(string) - Converts string to uppercase'],
    ['now', 'now() - Returns the current timestamp'],
    ['round', 'round(number, precision?) - Rounds a number'],
    ['string', 'string(value) - Converts value to string'],
    ['references', 'references(id) - Returns true if document references the ID'],
    ['dateTime', 'dateTime(string) - Parses an ISO 8601 date string'],
    ['boost', 'boost(condition, value) - Boosts score in text search'],
    ['score', 'score(conditions) - Returns relevance score'],
    ['order', 'order(field, direction?) - Sorts results'],
    ['pt', 'pt::text(blocks) - Extracts plain text from Portable Text'],
    ['geo', 'geo::distance(a, b) - Calculates distance between points'],
    ['math', 'math::sum(array), math::avg(array), etc. - Math operations'],
    ['array', 'array::unique(arr), array::compact(arr) - Array operations'],
    ['sanity', 'sanity::projectId(), sanity::dataset() - Sanity project info'],
  ])

  return docs.get(name) ?? null
}

/**
 * Build hover content from node info and type info
 */
function buildHoverContent(
  nodeInfo: NodeInfo,
  typeInfo: FormattedType | null
): MarkupContent | null {
  const parts: Array<string> = []

  // Type information
  if (typeInfo) {
    parts.push('```groq', `${nodeInfo.text}: ${typeInfo.text}`, '```')
    for (const note of typeInfo.notes) {
      parts.push('', `_${note}_`)
    }
  } else {
    parts.push(`**${nodeInfo.text}** (${nodeInfo.type})`)
  }

  // Documentation
  if (nodeInfo.documentation) {
    parts.push('', nodeInfo.documentation)
  }

  if (parts.length === 0) {
    return null
  }

  return {
    kind: 'markdown',
    value: parts.join('\n'),
  }
}
