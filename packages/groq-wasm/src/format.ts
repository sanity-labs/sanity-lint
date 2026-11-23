/**
 * GROQ Formatting via WASM
 *
 * Wraps the Rust groq-format library compiled to WASM.
 */

import { WasmError } from './types.js'
import type { WasmFormatConfig } from './types.js'
import { callFormat } from './wasm-loader.js'

/**
 * Default line width for formatting
 * Matches Rust groq-format DEFAULT_WIDTH
 */
export const DEFAULT_WIDTH = 80

/**
 * Format a GROQ query using the WASM-based formatter
 *
 * A document of only `fn` definitions, such as a file of shared custom functions, is formatted
 * too, although GROQ's parser requires a query to end with an expression.
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
    if (error instanceof WasmError) {
      throw error
    }

    const definitions = formatDefinitionsOnly(query, width)
    if (definitions !== undefined) {
      return definitions
    }

    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('parse') || message.includes('Parse')) {
      throw new WasmError(`Failed to parse query: ${message}`, 'PARSE_ERROR')
    }

    throw new WasmError(`Format failed: ${message}`, 'WASM_ERROR')
  }
}

const SENTINEL_HEADER = 'fn groqwasm::definitionsonly('
const SENTINEL = `\n${SENTINEL_HEADER}$x) = $x{};\nnull`

/**
 * `query` formatted, when it is only `fn` definitions (and comments), like a file of shared custom
 * functions. GROQ's parser requires a query to end with an expression, so the definitions are
 * formatted followed by one more definition and `null`, which are then cut off. A definition can
 * only follow definitions, so that parses only when everything before it is complete definitions.
 */
function formatDefinitionsOnly(query: string, width: number): string | undefined {
  if (!/^fn\s/.test(query.replace(/^(?:\s|\/\/[^\n]*)*/, ''))) {
    return undefined
  }
  let formatted: string
  try {
    formatted = callFormat(`${query}${SENTINEL}`, width)
  } catch {
    return undefined
  }
  const sentinel = formatted.lastIndexOf(`\n${SENTINEL_HEADER}`)
  return sentinel === -1 ? undefined : formatted.slice(0, sentinel).trimEnd()
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
