/**
 * Formatting capability for the GROQ Language Server
 *
 * Uses prettier-plugin-groq for GROQ formatting
 */

import type { TextEdit, Range } from 'vscode-languageserver'
import type { GroqQuery } from '../types.js'

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

/**
 * Format a GROQ query using prettier
 */
export async function formatQuery(
  query: GroqQuery,
  options: FormattingOptions = {}
): Promise<TextEdit[]> {
  try {
    // Dynamic import to avoid bundling issues
    const prettier = await import('prettier')
    const groqPlugin = await import('@sanity-labs/prettier-plugin-groq')

    const formatted = await prettier.format(query.query, {
      parser: 'groq',
      plugins: [groqPlugin.default ?? groqPlugin],
      tabWidth: options.tabSize ?? 2,
      useTabs: !(options.insertSpaces ?? true),
      printWidth: options.printWidth ?? 80,
    })

    // Trim trailing newline that prettier adds
    const trimmedFormatted = formatted.trimEnd()

    // No changes needed
    if (trimmedFormatted === query.query) {
      return []
    }

    // Calculate the range to replace
    const range = queryToRange(query)

    return [
      {
        range,
        newText: trimmedFormatted,
      },
    ]
  } catch (error) {
    // Formatting failed (likely parse error), return empty edits
    console.error('Formatting failed:', error)
    return []
  }
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
  const query: GroqQuery = {
    query: content.trim(),
    start: 0,
    end: content.length,
    line: 0,
    column: 0,
  }

  return formatQuery(query, options)
}
