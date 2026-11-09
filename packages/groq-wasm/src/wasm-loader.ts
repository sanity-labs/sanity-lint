/**
 * WASM module runtime.
 *
 * Exposes the WASM-backed lint/format/validate calls and init helpers.
 * Byte loading is platform-specific:
 * - `index.ts` reads the file and calls `initWasm` synchronously (Node).
 * - `index.browser.ts` fetches it with top-level await (browser).
 * - `index.lazy.ts` does neither until `load()` or `initWasm()`.
 */

import * as wasmModule from '../wasm/groq_wasm.js'

import { WasmError } from './types.js'

/**
 * Bytes, a compiled module, or a fetch `Response` accepted by {@link initWasm}.
 * A `Response` initializes asynchronously. The other forms are synchronous.
 */
export type WasmInitSource = ArrayBuffer | Uint8Array | WebAssembly.Module | Response

const NOT_INITIALIZED_MESSAGE =
  'GROQ WASM module is not initialized. Call load() or initWasm() before using this API.'

let initialized = false

export function isWasmInitialized(): boolean {
  return initialized
}

/**
 * Initialize the GROQ WebAssembly module.
 *
 * `ArrayBuffer`, `Uint8Array`, and `WebAssembly.Module` initialize
 * synchronously and this function returns `void`. A `Response` is consumed
 * asynchronously and this function returns a promise. `await initWasm(source)`
 * is valid for every accepted source. A second successful call does nothing.
 *
 * @throws {WasmError} With code `WASM_ERROR` when the bytes cannot be
 * instantiated, or when the module is not initialized yet and `source` is a
 * `Response` that is not ok.
 */
export function initWasm(source: ArrayBuffer | Uint8Array | WebAssembly.Module): void
export function initWasm(source: Response): Promise<void>
export function initWasm(source: WasmInitSource): void | Promise<void> {
  if (isResponse(source)) {
    return initFromResponse(source)
  }
  initFromCompiled(source)
}

export function callLint(query: string): string {
  assertInitialized()
  return wasmModule.lint(query)
}

export function callExtractParams(query: string): string {
  assertInitialized()
  return wasmModule.extractParams(query)
}

export function callFormat(query: string, width?: number): string {
  assertInitialized()
  return wasmModule.format(query, width ?? null)
}

export function callValidate(query: string): string {
  assertInitialized()
  return wasmModule.validate(query)
}

function assertInitialized(): void {
  if (!initialized) {
    throw new WasmError(NOT_INITIALIZED_MESSAGE, 'NOT_INITIALIZED')
  }
}

function isResponse(source: WasmInitSource): source is Response {
  return typeof Response === 'function' && source instanceof Response
}

function initFromCompiled(source: ArrayBuffer | Uint8Array | WebAssembly.Module): void {
  if (initialized) return

  try {
    wasmModule.initSync({ module: source })
  } catch (error) {
    throw new WasmError(
      `Failed to initialize WASM: ${error instanceof Error ? error.message : String(error)}`,
      'WASM_ERROR'
    )
  }

  initialized = true
}

async function initFromResponse(response: Response): Promise<void> {
  if (initialized) return

  if (!response.ok) {
    const from = response.url ? ` from ${response.url}` : ''
    throw new WasmError(
      `Failed to read GROQ WASM module${from}: ${response.status} ${response.statusText}`,
      'WASM_ERROR'
    )
  }

  initFromCompiled(await response.arrayBuffer())
}
