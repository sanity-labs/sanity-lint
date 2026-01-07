/**
 * WASM Module Loader
 *
 * Handles loading and initializing the WASM modules for groq-lint and groq-format.
 * Currently supports Node.js environments.
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
 * import { initWasm } from '@sanity/groq-wasm'
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
    // Dynamic import for the CommonJS WASM module
    // The wasm-pack nodejs target generates CJS with synchronous WASM loading
    const { createRequire } = await import('node:module')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')

    // Create a require function that can load CJS modules
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const require = createRequire(import.meta.url)

    // Load the WASM module - it will synchronously initialize
    // Use .cjs extension since wasm-pack generates CJS and our package uses "type": "module"
    const wasmPath = join(currentDir, '..', 'wasm', 'groq_wasm.cjs')
    const wasm = require(wasmPath)

    // Store the functions
    wasmLint = wasm.lint
    wasmFormat = wasm.format

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
