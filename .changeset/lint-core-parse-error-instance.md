---
'@sanity-labs/lint-core': patch
---

`parseGroq` and `assertValidGroq` in `@sanity-labs/lint-core/testing` throw an `Error` instance, so a failed parse has a stack trace. It still carries `message`, `query` and `position`, as the exported `GroqParseError` type describes.
