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

import { parse } from 'groq-js'
import type { ExprNode } from 'groq-js'

export interface GroqParseError {
  message: string
  position?: number
  query: string
}

class GroqQueryParseError extends Error implements GroqParseError {
  readonly query: string
  readonly position?: number

  constructor(message: string, query: string, position?: number) {
    super(message)
    this.name = 'GroqQueryParseError'
    this.query = query
    if (position !== undefined) {
      this.position = position
    }
  }
}

/**
 * Parse a GROQ query string and return the AST.
 * Throws a GroqParseError if the query is invalid.
 */
export function parseGroq(query: string): ExprNode {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new GroqQueryParseError('Empty GROQ query', query)
  }

  try {
    return parse(trimmed)
  } catch (error_) {
    const message = error_ instanceof Error ? error_.message : String(error_)
    // Extract position from groq-js error message if available
    const posMatch = message.match(/position (\d+)/)
    const position = posMatch?.[1] ? Number.parseInt(posMatch[1], 10) : undefined
    throw new GroqQueryParseError(message, query, position)
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
  } catch (error_) {
    if (!(error_ instanceof GroqQueryParseError)) {
      throw error_
    }
    const error = error_
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

    throw new Error(message, { cause: error_ })
  }
}
