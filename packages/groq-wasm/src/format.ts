/**
 * GROQ Formatting via WASM
 *
 * Wraps the Rust groq-format library compiled to WASM.
 */

import { WasmError, type WasmFormatConfig } from './types.js'
import { callFormat, isInitialized } from './wasm-loader.js'

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
 * @throws {WasmError} If WASM is not initialized or query parsing fails
 *
 * @example
 * ```typescript
 * import { initWasm, format } from '@sanity/groq-wasm'
 *
 * await initWasm()
 *
 * const formatted = format('*[_type=="post"]{title,body}')
 * // '*[_type == "post"]{ title, body }'
 * ```
 */
export function format(query: string, config?: WasmFormatConfig): string {
  if (!isInitialized()) {
    throw new WasmError('WASM not initialized. Call initWasm() first.', 'NOT_INITIALIZED')
  }

  const width = config?.width ?? DEFAULT_WIDTH

  // Handle empty query
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
 * Async version of format for environments that prefer promises
 */
export async function formatAsync(query: string, config?: WasmFormatConfig): Promise<string> {
  // WASM operations are synchronous, but we provide async API
  // for consistency and future-proofing
  return format(query, config)
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
    // Re-throw other errors
    throw error
  }
}
