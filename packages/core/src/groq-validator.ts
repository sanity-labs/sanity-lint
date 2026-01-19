/**
 * GROQ validation utilities using groq-js as the single source of truth.
 *
 * Use these in tests to ensure queries are valid GROQ syntax:
 *
 * ```ts
 * import { assertValidGroq } from '@sanity-labs/lint-core/testing'
 *
 * it('produces valid GROQ', () => {
 *   const result = formatGroq(query)
 *   assertValidGroq(result) // Throws if invalid
 * })
 * ```
 */

import { parse, type ExprNode } from 'groq-js'

export interface GroqParseError {
  message: string
  position?: number
  query: string
}

/**
 * Parse a GROQ query string and return the AST.
 * Throws a GroqParseError if the query is invalid.
 */
export function parseGroq(query: string): ExprNode {
  const trimmed = query.trim()
  if (!trimmed) {
    const error: GroqParseError = {
      message: 'Empty GROQ query',
      query,
    }
    throw error
  }

  try {
    return parse(trimmed)
  } catch (e) {
    const error: GroqParseError = {
      message: e instanceof Error ? e.message : String(e),
      query,
    }
    // Extract position from groq-js error message if available
    const posMatch = error.message.match(/position (\d+)/)
    if (posMatch && posMatch[1]) {
      error.position = parseInt(posMatch[1], 10)
    }
    throw error
  }
}

/**
 * Check if a string is valid GROQ syntax.
 * Returns true if valid, false if invalid.
 */
export function isValidGroq(query: string): boolean {
  try {
    parseGroq(query)
    return true
  } catch {
    return false
  }
}

/**
 * Assert that a string is valid GROQ syntax.
 * Throws an error with helpful context if invalid.
 *
 * Use this in tests to validate formatter output or generated queries.
 */
export function assertValidGroq(query: string, context?: string): void {
  try {
    parseGroq(query)
  } catch (e) {
    const error = e as GroqParseError
    let message = `Invalid GROQ syntax: ${error.message}`
    if (context) {
      message = `${context}: ${message}`
    }
    if (error.position !== undefined) {
      // Show the query with a pointer to the error position
      const lines = error.query.split('\n')
      let charCount = 0
      let errorCol = 0

      for (const line of lines) {
        if (charCount + line.length >= error.position) {
          errorCol = error.position - charCount
          break
        }
        charCount += line.length + 1 // +1 for newline
      }

      message += `\n\nQuery:\n${error.query}\n${' '.repeat(errorCol)}^ position ${error.position}`
    } else {
      message += `\n\nQuery:\n${error.query}`
    }

    throw new Error(message)
  }
}
