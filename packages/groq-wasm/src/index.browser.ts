/**
 * @sanity-labs/groq-wasm — Browser entry.
 *
 * Fetches the WASM bytes at import time and initializes the module via
 * top-level await + `initSync`. After this module finishes loading,
 * `lint()` and `format()` are usable synchronously. Bundlers that
 * understand `new URL('...', import.meta.url)` (Vite, Rollup, Webpack 5,
 * esbuild) emit the WASM file as an asset and rewrite the URL.
 */

import { initWasm } from './wasm-loader.js'

const wasmUrl = new URL('../wasm/groq_wasm_bg.wasm', import.meta.url)
const response = await fetch(wasmUrl)
initWasm(await response.arrayBuffer())

export * from './public.js'
