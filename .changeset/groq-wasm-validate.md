---
'@sanity-labs/groq-wasm': minor
---

Add `validate(query)`, which parses a GROQ query and returns `{ ok: true }` or a syntax error. The error includes the parser message, inclusive/exclusive `start` and `end` as UTF-16 code unit indices, and 1-based line and column for both ends. Existing `lint`, `format`, and `isValidSyntax` behavior is unchanged.
