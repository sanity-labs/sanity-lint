---
'@sanity-labs/groq-wasm': minor
---

Add `extractParams(query)`, which lists the `$parameters` a GROQ query references using groq-parser. It returns one entry per distinct name (without the `$`) in order of first reference, each with every reference's `start` / `end` as UTF-16 code unit indices and 1-based line and column for both ends. Custom function parameters are excluded inside their function body. An empty query returns `[]`, and invalid syntax throws `WasmError` with code `PARSE_ERROR`, like `lint` and `format`. Existing APIs are unchanged.
