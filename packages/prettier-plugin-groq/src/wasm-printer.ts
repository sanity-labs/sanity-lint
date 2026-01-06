/**
 * WASM-based GROQ printer for Prettier
 *
 * Uses @sanity/groq-wasm for high-performance formatting.
 * Falls back to the TypeScript printer if WASM is not available.
 */

import type { Printer, doc } from 'prettier'
import { createGroqPrinter } from './printer.js'

// WASM module state
let wasmAvailable = false
let wasmInitialized = false
let wasmInitPromise: Promise<boolean> | null = null

// WASM module reference
type WasmModule = typeof import('@sanity/groq-wasm')
let wasmModule: WasmModule | null = null

/**
 * Initialize the WASM formatter
 *
 * Call this once at application startup for best performance.
 * The plugin will fall back to TypeScript formatting if WASM is not available.
 *
 * @returns Promise that resolves to true if WASM is available
 *
 * @example
 * ```typescript
 * import { initWasmFormatter } from 'prettier-plugin-groq'
 *
 * // Optional: Initialize WASM for better performance
 * await initWasmFormatter()
 * ```
 */
export async function initWasmFormatter(): Promise<boolean> {
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
    wasmModule = await import('@sanity/groq-wasm')
    await wasmModule.initWasm()
    wasmAvailable = true
    wasmInitialized = true
    return true
  } catch {
    wasmAvailable = false
    wasmInitialized = true
    return false
  }
}

/**
 * Check if WASM formatter is available
 */
export function isWasmFormatterAvailable(): boolean {
  return wasmAvailable
}

/**
 * Format a GROQ query using WASM
 *
 * @param query - The GROQ query to format
 * @param width - Maximum line width (default: 80)
 * @returns Formatted query string
 * @throws If WASM is not initialized
 */
export function formatWithWasm(query: string, width?: number): string {
  if (!wasmAvailable || !wasmModule) {
    throw new Error('WASM formatter not initialized. Call initWasmFormatter() first.')
  }
  return wasmModule.format(query, width !== undefined ? { width } : undefined)
}

/**
 * Create a WASM-accelerated GROQ printer
 *
 * Uses WASM formatting when available, falls back to TypeScript printer otherwise.
 */
export function createWasmGroqPrinter(builders: typeof doc.builders): Printer {
  // Create TS fallback printer
  const tsPrinter = createGroqPrinter(builders)

  return {
    print(path, options, print) {
      // If WASM is available and we have the original text, use WASM
      if (wasmAvailable && wasmModule && options.originalText) {
        try {
          const width = options.printWidth || 80
          const formatted = wasmModule.format(options.originalText, { width })
          // Return as a simple string Doc
          return formatted
        } catch {
          // Fall back to TS printer on error
        }
      }

      // Fall back to TypeScript printer
      return tsPrinter.print(path, options, print)
    },
  }
}
