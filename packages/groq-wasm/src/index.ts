/**
 * @sanity-labs/groq-wasm — Node entry.
 *
 * Loads the WASM module synchronously at import time using `fs.readFileSync`
 * + `initSync`. After importing this package, `lint()` and `format()` are
 * usable immediately — no async bootstrap.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { initWasm } from './wasm-loader.js'

const wasmPath = fileURLToPath(new URL('../wasm/groq_wasm_bg.wasm', import.meta.url))
initWasm(readFileSync(wasmPath))

export * from './public.js'
