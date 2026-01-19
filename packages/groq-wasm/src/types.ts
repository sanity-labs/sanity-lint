/**
 * Types for @sanity-labs/groq-wasm
 *
 * These types match the Rust API from groq-lint and groq-format,
 * converted to TypeScript conventions (snake_case → camelCase).
 */

/**
 * Severity levels matching Rust groq-lint
 * Rust: High, Medium, Low → TS: error, warning, info
 */
export type WasmSeverity = 'high' | 'medium' | 'low'

/**
 * Map WASM severity to our standard severity
 */
export function mapSeverity(wasmSeverity: WasmSeverity): 'error' | 'warning' | 'info' {
  switch (wasmSeverity) {
    case 'high':
      return 'error'
    case 'medium':
      return 'warning'
    case 'low':
      return 'info'
  }
}

/**
 * A finding from the Rust linter (JSON format from WASM)
 */
export interface WasmFinding {
  /** Rule ID (snake_case from Rust) */
  ruleId: string
  /** Human-readable message */
  message: string
  /** Severity level */
  severity: WasmSeverity
  /** Start byte offset (0-based) */
  start: number
  /** End byte offset (0-based) */
  end: number
}

/**
 * Configuration for linting
 */
export interface WasmLintConfig {
  /** Rules to enable/disable (rule_id → enabled) */
  rules?: Record<string, boolean>
}

/**
 * Configuration for formatting
 */
export interface WasmFormatConfig {
  /** Maximum line width (default: 80) */
  width?: number
}

/**
 * Error from WASM operations
 */
export class WasmError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_INITIALIZED' | 'PARSE_ERROR' | 'WASM_ERROR'
  ) {
    super(message)
    this.name = 'WasmError'
  }
}

/**
 * Rule ID mapping from Rust (snake_case) to TS (kebab-case)
 */
export const RULE_ID_MAP: Record<string, string> = {
  join_in_filter: 'join-in-filter',
  join_to_get_id: 'join-to-get-id',
  computed_value_in_filter: 'computed-value-in-filter',
  match_on_id: 'match-on-id',
  order_on_expr: 'order-on-expr',
  deep_pagination: 'deep-pagination',
  large_pages: 'large-pages',
  non_literal_comparison: 'non-literal-comparison',
  repeated_dereference: 'repeated-dereference',
  count_in_correlated_subquery: 'count-in-correlated-subquery',
  very_large_query: 'very-large-query',
  extremely_large_query: 'extremely-large-query',
  many_joins: 'many-joins',
}

/**
 * Convert Rust rule ID to TS convention
 */
export function mapRuleId(rustRuleId: string): string {
  return RULE_ID_MAP[rustRuleId] ?? rustRuleId.replace(/_/g, '-')
}
