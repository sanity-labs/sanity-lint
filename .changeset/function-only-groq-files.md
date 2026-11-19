---
'@sanity-labs/groq-wasm': patch
'@sanity-labs/groq-lint': minor
'@sanity-labs/groq-lsp': minor
---

`format()` formats a GROQ document of only `fn` definitions, like a `.groq` file of shared custom functions, instead of failing to parse it. groq-lint exports `isDefinitionsOnly()`, also from `@sanity-labs/groq-lint/definitions` without WASM. groq-lsp adds go to definition and find references for custom functions, and a `@sanity-labs/groq-lsp/functions` entry with groq-content-mapper's settings, `withGroqFunctions()` and the definitions and calls in GROQ source, without WASM.
