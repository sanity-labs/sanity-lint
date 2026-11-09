/**
 * @sanity-labs/groq-wasm — Lazy entry (`@sanity-labs/groq-wasm/lazy`).
 *
 * Re-exports the public API plus `load()` and `initWasm()`. Evaluating this
 * module does not fetch or compile the WebAssembly module and does not use
 * top-level await. Call `load()` (or `initWasm()` with your own bytes) before
 * `lint()`, `format()`, `validate()`, or `extractParams()`.
 *
 * Bundlers that understand `new URL('...', import.meta.url)` rewrite the URL
 * inside `load()` and emit the `.wasm` file as an asset.
 */

import { WasmError } from './types.js'
import { initWasm, isWasmInitialized, type WasmInitSource } from './wasm-loader.js'

export { initWasm, type WasmInitSource }
export * from './public.js'

let pendingLoad: Promise<void> | undefined

/**
 * Fetch the packaged WebAssembly module and initialize it.
 *
 * Resolves immediately when the module is already initialized. Concurrent
 * calls share one in-flight request. A rejection leaves the module
 * uninitialized so a later call can retry.
 *
 * @throws {WasmError} With code `WASM_ERROR` when the file cannot be fetched
 * or instantiated.
 */
export function load(): Promise<void> {
  if (isWasmInitialized()) return Promise.resolve()
  if (!pendingLoad) {
    pendingLoad = fetchAndInit().finally(() => {
      pendingLoad = undefined
    })
  }
  return pendingLoad
}

async function fetchAndInit(): Promise<void> {
  const wasmUrl = new URL('../wasm/groq_wasm_bg.wasm', import.meta.url)
  let response: Response
  try {
    response = await fetch(wasmUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new WasmError(
      `Failed to fetch GROQ WASM module from ${wasmUrl.href}: ${message}`,
      'WASM_ERROR'
    )
  }

  if (!response.ok) {
    throw new WasmError(
      `Failed to fetch GROQ WASM module from ${wasmUrl.href}: ${response.status} ${response.statusText}`,
      'WASM_ERROR'
    )
  }

  await initWasm(response)
}
