/**
 * WASM-based linter for pure GROQ rules
 *
 * Uses @sanity/groq-wasm for high-performance linting of GROQ queries.
 * Falls back gracefully if WASM is not available.
 */

import type { Finding } from '@sanity/lint-core'

// WASM module state
let wasmAvailable = false
let wasmInitialized = false
let wasmInitPromise: Promise<boolean> | null = null

// Import types for the WASM module
type WasmModule = typeof import('@sanity/groq-wasm')
let wasmModule: WasmModule | null = null

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
 * Initialize the WASM linter
 *
 * Safe to call multiple times. Returns true if WASM is available.
 */
export async function initWasmLinter(): Promise<boolean> {
  if (wasmInitialized) {
    return wasmAvailable
  }

  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = doInit()
  return wasmInitPromise
}

async function doInit(): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling issues
    wasmModule = await import('@sanity/groq-wasm')
    await wasmModule.initWasm()
    wasmAvailable = true
    wasmInitialized = true
    return true
  } catch {
    // WASM not available - will fall back to TS rules
    wasmAvailable = false
    wasmInitialized = true
    return false
  }
}

/**
 * Check if WASM linter is available
 */
export function isWasmAvailable(): boolean {
  return wasmAvailable
}

/**
 * Lint a query using WASM
 *
 * @param query - The GROQ query to lint
 * @param enabledRules - Optional set of rule IDs to enable (all if not provided)
 * @returns Array of findings from WASM linter
 * @throws If WASM is not initialized
 */
export function lintWithWasm(query: string, enabledRules?: Set<string>): Finding[] {
  if (!wasmAvailable || !wasmModule) {
    throw new Error('WASM linter not initialized. Call initWasmLinter() first.')
  }

  // Get findings from WASM
  const wasmFindings = wasmModule.lint(query)

  // Filter by enabled rules if provided
  if (enabledRules) {
    return wasmFindings.filter((f) => enabledRules.has(f.ruleId))
  }

  return wasmFindings
}

/**
 * Lint a query using WASM (async version)
 *
 * Automatically initializes WASM if needed.
 */
export async function lintWithWasmAsync(
  query: string,
  enabledRules?: Set<string>
): Promise<Finding[]> {
  const available = await initWasmLinter()
  if (!available) {
    return [] // Return empty - caller should use TS fallback
  }
  return lintWithWasm(query, enabledRules)
}
