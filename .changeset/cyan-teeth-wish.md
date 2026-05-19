---
'@sanity-labs/prettier-plugin-groq': major
'@sanity-labs/eslint-plugin': major
'@sanity-labs/schema-lint': major
'@sanity-labs/groq-lint': major
'@sanity-labs/groq-wasm': major
'prettier-test': major
'@sanity-labs/groq-lsp': major
'groq-lint-playground': major
'@sanity-labs/lint-core': major
---

BREAKING CHANGE: Minimum node.js version is now v22.3.0.

BREAKING CHANGE: (Explicit) CommonJS support has been been dropped. All supported node.js versions now has transparent CommonJS/ESM interop.

Init/loading is now automatically handled - `@sanity-labs/groq-lint` methods `initLinter` and `isWasmAvailable` is removed.
