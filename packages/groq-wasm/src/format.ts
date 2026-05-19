/**
 * GROQ Formatting via WASM
 *
 * Wraps the Rust groq-format library compiled to WASM.
 */

import { WasmError, type WasmFormatConfig } from './types.js'
import { callFormat } from './wasm-loader.js'

/**
 * Default line width for formatting
 * Matches Rust groq-format DEFAULT_WIDTH
 */
export const DEFAULT_WIDTH = 80

/**
 * Format a GROQ query using the WASM-based formatter
 *
 * @param query - The GROQ query string to format
 * @param config - Optional configuration (width defaults to 80)
 * @returns Formatted query string
 * @throws {WasmError} If query parsing fails
 *
 * @example
 * ```typescript
 * import {format} from '@sanity-labs/groq-wasm'
 *
 * const formatted = format('*[_type=="post"]{title,body}')
 * // '*[_type == "post"]{ title, body }'
 * ```
 */
export function format(query: string, config?: WasmFormatConfig): string {
  const width = config?.width ?? DEFAULT_WIDTH

  if (!query.trim()) {
    return query
  }

  try {
    return callFormat(query, width)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('parse') || message.includes('Parse')) {
      throw new WasmError(`Failed to parse query: ${message}`, 'PARSE_ERROR')
    }

    throw new WasmError(`Format failed: ${message}`, 'WASM_ERROR')
  }
}

/**
 * Check if a query can be parsed (without full formatting)
 *
 * @param query - The GROQ query to validate
 * @returns true if the query is valid GROQ syntax
 */
export function isValidSyntax(query: string): boolean {
  try {
    format(query)
    return true
  } catch (error) {
    if (error instanceof WasmError && error.code === 'PARSE_ERROR') {
      return false
    }
    throw error
  }
}
