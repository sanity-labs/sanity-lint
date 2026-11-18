/**
 * Formatting capability for the GROQ Language Server
 *
 * Uses groq-format through @sanity-labs/groq-wasm
 */

import { DEFAULT_WIDTH, format, WasmError } from '@sanity-labs/groq-wasm'
import type { TextEdit, Range } from 'vscode-languageserver'
import type { GroqQuery } from '../types.js'
import { extractQueries } from '../utils/groq-extractor.js'

/**
 * Options for formatting
 */
export interface FormattingOptions {
  /** Tab size in spaces */
  tabSize?: number
  /** Use tabs instead of spaces */
  insertSpaces?: boolean
  /** Print width (line length) */
  printWidth?: number
}

/** groq-format always indents with two spaces per level. */
const GROQ_FORMAT_INDENT = '  '

/**
 * Format GROQ source with groq-wasm's `format`, indented with `tabSize` spaces (default 2) or,
 * when `insertSpaces` is false, a tab per level. Throws a `WasmError` if the query cannot be parsed.
 */
function formatGroq(source: string, options: FormattingOptions = {}): string {
  const formatted = format(source, { width: options.printWidth ?? DEFAULT_WIDTH }).trimEnd()
  const unit = (options.insertSpaces ?? true) ? ' '.repeat(options.tabSize ?? 2) : '\t'
  if (unit === GROQ_FORMAT_INDENT) {
    return formatted
  }
  // groq-format escapes line breaks inside strings, so leading spaces on a line are always indentation.
  return formatted.replace(/^(?: {2})+/gm, (indent) =>
    unit.repeat(indent.length / GROQ_FORMAT_INDENT.length)
  )
}

/**
 * Format a GROQ query with groq-format
 */
export async function formatQuery(
  query: GroqQuery,
  options: FormattingOptions = {}
): Promise<TextEdit[]> {
  let formatted: string
  try {
    formatted = formatGroq(query.query, options)
  } catch (error) {
    if (!(error instanceof WasmError && error.code === 'PARSE_ERROR')) {
      console.error('Formatting failed:', error)
    }
    return []
  }

  if (formatted === query.query) {
    return []
  }

  return [
    {
      range: queryToRange(query),
      newText: formatted,
    },
  ]
}

/**
 * Format all queries in a document
 */
export async function formatDocument(
  queries: GroqQuery[],
  _documentContent: string,
  options: FormattingOptions = {}
): Promise<TextEdit[]> {
  const edits: TextEdit[] = []

  // Process queries in reverse order so edits don't affect subsequent positions
  const sortedQueries = [...queries].sort((a, b) => b.start - a.start)

  for (const query of sortedQueries) {
    const queryEdits = await formatQuery(query, options)
    edits.push(...queryEdits)
  }

  return edits
}

/**
 * Convert a GroqQuery to an LSP Range
 */
function queryToRange(query: GroqQuery): Range {
  // Calculate end position
  const lines = query.query.split('\n')
  const endLine = query.line + lines.length - 1
  const endChar =
    lines.length === 1 ? query.column + query.query.length : (lines[lines.length - 1]?.length ?? 0)

  return {
    start: { line: query.line, character: query.column },
    end: { line: endLine, character: endChar },
  }
}

/**
 * Format a range in a GROQ file (.groq)
 * The entire file is treated as a single query
 */
export async function formatGroqFile(
  content: string,
  options: FormattingOptions = {}
): Promise<TextEdit[]> {
  const [query] = extractQueries(content, 'groq').queries
  if (!query) {
    return []
  }

  return formatQuery(query, options)
}
