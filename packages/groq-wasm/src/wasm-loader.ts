/**
 * WASM Module Loader
 *
 * Handles loading and initializing the WASM modules for groq-lint and groq-format.
 * Uses the `--target web` output from wasm-pack, which works in both Node.js and browsers.
 */

import { WasmError } from './types.js'

// WASM module state
let initialized = false
let initPromise: Promise<void> | null = null

// WASM module functions (set after initialization)
let wasmLint: ((query: string) => string) | null = null
let wasmFormat: ((query: string, width?: number | null) => string) | null = null

/**
 * Check if WASM modules are initialized
 */
export function isInitialized(): boolean {
  return initialized
}

/**
 * Initialize WASM modules
 *
 * Call this once at application startup. Safe to call multiple times.
 *
 * @example
 * ```typescript
 * import { initWasm } from '@sanity-labs/groq-wasm'
 *
 * await initWasm()
 * // Now lint() and format() are ready to use
 * ```
 */
export async function initWasm(): Promise<void> {
  if (initialized) {
    return
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = doInit()
  await initPromise
}

async function doInit(): Promise<void> {
  try {
    const wasmModule = await import('../wasm/groq_wasm.js')
    const wasmUrl = new URL('../wasm/groq_wasm_bg.wasm', import.meta.url)

    if (wasmUrl.protocol === 'file:') {
      // Node.js: fetch() doesn't support file:// URLs, read from disk
      const { readFile } = await import('node:fs/promises')
      const { fileURLToPath } = await import('node:url')
      const bytes = await readFile(fileURLToPath(wasmUrl))
      await wasmModule.default({ module_or_path: bytes })
    } else {
      // Browser / other runtimes: use fetch via the default init path
      await wasmModule.default({ module_or_path: wasmUrl })
    }

    // Store the functions
    wasmLint = wasmModule.lint
    wasmFormat = wasmModule.format

    initialized = true
  } catch (error) {
    initPromise = null
    throw new WasmError(
      `Failed to initialize WASM: ${error instanceof Error ? error.message : String(error)}`,
      'WASM_ERROR'
    )
  }
}

/**
 * Call the WASM lint function
 * @throws {WasmError} If not initialized
 */
export function callLint(query: string): string {
  if (!initialized || !wasmLint) {
    throw new WasmError('WASM not initialized. Call initWasm() first.', 'NOT_INITIALIZED')
  }
  return wasmLint(query)
}

/**
 * Call the WASM format function
 * @throws {WasmError} If not initialized
 */
export function callFormat(query: string, width?: number): string {
  if (!initialized || !wasmFormat) {
    throw new WasmError('WASM not initialized. Call initWasm() first.', 'NOT_INITIALIZED')
  }
  return wasmFormat(query, width ?? null)
}
