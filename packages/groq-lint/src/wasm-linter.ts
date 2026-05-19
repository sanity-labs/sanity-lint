/**
 * WASM-based linter for pure GROQ rules.
 *
 * Uses @sanity-labs/groq-wasm for high-performance linting of GROQ queries.
 * The WASM module is initialized synchronously at import time.
 */

import type { Finding } from '@sanity-labs/lint-core'
import { lint as wasmLint } from '@sanity-labs/groq-wasm'

/**
 * Rules available in the WASM linter (from Rust groq-lint)
 */
export const WASM_RULES = new Set([
  'join-in-filter',
  'join-to-get-id',
  'computed-value-in-filter',
  'match-on-id',
  'order-on-expr',
  'deep-pagination',
  'large-pages',
  'non-literal-comparison',
  'repeated-dereference',
  'count-in-correlated-subquery',
  'very-large-query',
  'extremely-large-query',
  'many-joins',
])

/**
 * Check if a rule is available in WASM
 */
export function isWasmRule(ruleId: string): boolean {
  return WASM_RULES.has(ruleId)
}

/**
 * Lint a query using WASM.
 *
 * @param query - The GROQ query to lint
 * @param enabledRules - Optional set of rule IDs to enable (all if not provided)
 * @returns Array of findings from WASM linter
 */
export function lintWithWasm(query: string, enabledRules?: Set<string>): Finding[] {
  const findings = wasmLint(query)
  if (!enabledRules) return findings
  return findings.filter((f) => enabledRules.has(f.ruleId))
}
