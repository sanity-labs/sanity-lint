---
'@sanity-labs/groq-wasm': patch
'@sanity-labs/groq-lint': patch
---

Update the Rust dependencies behind the WASM bindings and rebuild the committed `wasm/` artifacts. Upstream `groq-lint` dropped the `repeated_dereference` rule and added `unlimited_query`, so `repeated-dereference` is now served by the TypeScript implementation in `@sanity-labs/groq-lint` instead of WASM.
