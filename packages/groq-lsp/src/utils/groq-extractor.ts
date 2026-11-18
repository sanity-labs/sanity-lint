/**
 * Extract GROQ queries from source files
 *
 * Supports:
 * - .groq files (entire content is GROQ)
 * - .ts/.tsx/.js/.jsx files (groq`...`, defineQuery(`...`) and /* groq *\/ `...` templates)
 */

import type { ExtractionResult, GroqQuery } from '../types.js'

/**
 * Extract GROQ queries from a document based on its language/file type
 */
export function extractQueries(content: string, languageId: string): ExtractionResult {
  switch (languageId) {
    case 'groq':
      return extractFromGroqFile(content)
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return extractFromJsTs(content)
    default:
      return { queries: [], errors: [] }
  }
}

/**
 * Convert a document offset to a 0-indexed line and column
 */
function offsetToLineColumn(content: string, offset: number): { line: number; column: number } {
  let line = 0
  let lineStart = 0
  for (let i = content.indexOf('\n'); i !== -1 && i < offset; i = content.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return { line, column: offset - lineStart }
}

/**
 * Extract from a .groq file - the entire content is a GROQ query
 */
function extractFromGroqFile(content: string): ExtractionResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { queries: [], errors: [] }
  }

  const start = content.indexOf(trimmed)

  return {
    queries: [
      {
        query: trimmed,
        start,
        end: start + trimmed.length,
        ...offsetToLineColumn(content, start),
      },
    ],
    errors: [],
  }
}

/**
 * Matches the text that introduces an embedded GROQ template literal. The
 * lookahead leaves the opening backtick for the caller to consume.
 * - groq`...`
 * - defineQuery(`...`)
 * - /* groq *\/ `...`
 *
 * Only template literals are recognised: quoted strings may contain escapes
 * that shift offsets, and formatting them would break the surrounding code.
 */
const EMBEDDED_QUERY_PREFIX =
  /\bgroq\s*(?=`)|\bdefineQuery\s*\(\s*(?=`)|\/\*\s*groq\s*\*\/\s*(?=`)/g

/**
 * Extract GROQ from JavaScript/TypeScript files
 * Looks for groq`...`, defineQuery(`...`) and /* groq *\/ `...` templates
 * (nested backticks are not handled; that would need a proper parser)
 */
function extractFromJsTs(content: string): ExtractionResult {
  const queries: GroqQuery[] = []
  const errors: string[] = []

  EMBEDDED_QUERY_PREFIX.lastIndex = 0

  let match
  while ((match = EMBEDDED_QUERY_PREFIX.exec(content)) !== null) {
    const queryStart = match.index + match[0].length + 1
    const queryEnd = content.indexOf('`', queryStart)
    if (queryEnd === -1) continue

    queries.push({
      query: content.slice(queryStart, queryEnd),
      start: queryStart,
      end: queryEnd,
      ...offsetToLineColumn(content, queryStart),
    })

    EMBEDDED_QUERY_PREFIX.lastIndex = queryEnd + 1
  }

  return { queries, errors }
}

/**
 * Find which query (if any) contains a given offset
 */
export function findQueryAtOffset(queries: GroqQuery[], offset: number): GroqQuery | undefined {
  return queries.find((q) => offset >= q.start && offset <= q.end)
}

/**
 * Convert a document offset to a position within a query
 * Returns the offset relative to the query start
 */
export function offsetToQueryPosition(query: GroqQuery, documentOffset: number): number {
  return documentOffset - query.start
}
