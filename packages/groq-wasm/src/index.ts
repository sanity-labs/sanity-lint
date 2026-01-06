/**
 * @sanity/groq-wasm
 *
 * WASM bindings for GROQ linting and formatting.
 *
 * This package provides TypeScript wrappers around:
 * - groq-lint (Rust) - GROQ query linting
 * - groq-format (Rust) - GROQ query formatting
 *
 * Both are compiled to WebAssembly for use in Node.js and browsers
 * without requiring the Rust toolchain.
 *
 * @example
 * ```typescript
 * import { initWasm, lint, format } from '@sanity/groq-wasm'
 *
 * // Initialize WASM (call once at startup)
 * await initWasm()
 *
 * // Lint a query
 * const findings = lint('*[_type == "post"]{ author-> }')
 * console.log(findings)
 * // [{ ruleId: 'join-in-filter', message: '...', severity: 'error' }]
 *
 * // Format a query
 * const formatted = format('*[_type=="post"]{title,body}')
 * console.log(formatted)
 * // '*[_type == "post"]{ title, body }'
 * ```
 *
 * @packageDocumentation
 */

// Re-export from lint module
export { lint, lintAsync } from './lint.js'

// Re-export from format module
export { DEFAULT_WIDTH, format, formatAsync, isValidSyntax } from './format.js'

// Re-export from wasm-loader
export { initWasm, isInitialized } from './wasm-loader.js'

// Re-export types
export {
  mapRuleId,
  mapSeverity,
  RULE_ID_MAP,
  WasmError,
  type WasmFinding,
  type WasmFormatConfig,
  type WasmLintConfig,
  type WasmSeverity,
} from './types.js'
