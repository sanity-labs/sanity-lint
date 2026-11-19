---
'@sanity-labs/lint-core': patch
'@sanity-labs/eslint-plugin': patch
'@sanity-labs/groq-lint': patch
'@sanity-labs/groq-lsp': patch
'@sanity-labs/groq-wasm': patch
'@sanity-labs/prettier-plugin-groq': patch
'@sanity-labs/schema-lint': patch
---

Build with tsdown instead of tsup. Entry points, exports, `.d.ts` files and the `wasm` folder are unchanged; internal chunk file names differ, and built-in imports keep their `node:` prefix.
