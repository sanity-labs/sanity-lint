/**
 * Shared public API surface.
 *
 * Imported by both the Node and browser entry points after each has
 * initialized the WASM module in its own environment-appropriate way.
 */

export { lint } from './lint.js'
export { DEFAULT_WIDTH, format, isValidSyntax } from './format.js'
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
