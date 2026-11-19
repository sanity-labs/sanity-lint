import { parse } from 'groq-js'

/** What follows a document of only `fn` definitions so that GROQ's parsers accept it. */
export const DEFINITIONS_SENTINEL = 'null'

/**
 * Whether `query` is only `fn` definitions (and comments), like a file of shared custom functions.
 *
 * GROQ's parsers, groq-js and the Rust parser behind groq-wasm, require a query to end with an
 * expression. Definitions followed by `null` parse, and since groq-js inlines functions where they
 * are called, `null` is then the whole syntax tree. Anything else before `null` would show in it.
 */
export function isDefinitionsOnly(query: string): boolean {
  if (!/^fn\s/.test(query.replace(/^(?:\s|\/\/[^\n]*)*/, ''))) {
    return false
  }
  try {
    parse(query)
    return false
  } catch {
    // Expected when nothing follows the definitions
  }
  try {
    const ast = parse(`${query}\n${DEFINITIONS_SENTINEL}`)
    return ast.type === 'Value' && ast.value === null
  } catch {
    return false
  }
}
