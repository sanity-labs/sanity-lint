/**
 * Shared public API surface.
 *
 * Imported by the Node, browser, and lazy entries. The Node and browser
 * entries initialize the WASM module before these functions are used. The
 * lazy entry does not: call `load()` or `initWasm()` first.
 */

export { extractParams } from './params.js'
export { lint } from './lint.js'
export { DEFAULT_WIDTH, format, isValidSyntax } from './format.js'
export { validate } from './validate.js'
export {
  mapRuleId,
  mapSeverity,
  RULE_ID_MAP,
  WasmError,
  type ValidateError,
  type ValidateResult,
  type WasmFinding,
  type WasmFormatConfig,
  type WasmLintConfig,
  type WasmSeverity,
  type ParamReference,
  type QueryParam,
} from './types.js'
