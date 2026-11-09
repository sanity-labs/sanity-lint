---
'@sanity-labs/groq-wasm': minor
---

Add `@sanity-labs/groq-wasm/lazy` for bundlers that cannot handle top-level await. It exports the same API as the main entry, plus `load()` and `initWasm()`, and does not fetch or compile the WebAssembly module until one of those is called. `load()` fetches the packaged `.wasm` once, including when several callers race. `initWasm()` accepts bytes, a `Response`, or a `WebAssembly.Module`. Using `lint`, `format`, `validate`, `extractParams`, or `isValidSyntax` before initialization throws `WasmError` with code `NOT_INITIALIZED`. The raw module is exported at `@sanity-labs/groq-wasm/wasm`. The default entry still initializes on import and does not export `load` or `initWasm`.
