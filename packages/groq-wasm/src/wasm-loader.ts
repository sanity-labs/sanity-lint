/**
 * WASM module runtime.
 *
 * Exposes the WASM-backed lint/format calls and a synchronous init helper.
 * The actual byte loading is platform-specific and happens in the
 * environment-specific entry (`index.ts` for Node, `index.browser.ts` for
 * the browser). By the time any caller of this package can call `lint()` /
 * `format()`, the entry has already run `initWasm(bytes)`.
 */

import * as wasmModule from '../wasm/groq_wasm.js'

import { WasmError } from './types.js'

export function initWasm(bytes: BufferSource): void {
  try {
    wasmModule.initSync({ module: bytes })
  } catch (error) {
    throw new WasmError(
      `Failed to initialize WASM: ${error instanceof Error ? error.message : String(error)}`,
      'WASM_ERROR'
    )
  }
}

export function callLint(query: string): string {
  return wasmModule.lint(query)
}

export function callFormat(query: string, width?: number): string {
  return wasmModule.format(query, width ?? null)
}
