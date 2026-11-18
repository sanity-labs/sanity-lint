---
'@sanity-labs/groq-wasm': patch
'@sanity-labs/prettier-plugin-groq': patch
---

Keep bracket notation when formatting attribute access with a key that is not a valid GROQ identifier. `title["en-US"]`, `author->["b-c"]`, `@[""]` and `@["1"]` were printed as `title.en-US`, `author->b-c`, `@.` and `@.1`, which change meaning or fail to parse. Keys that are valid identifiers still print in dot form.
