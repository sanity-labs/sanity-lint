---
'@sanity-labs/lint-core': patch
'@sanity-labs/groq-lint': patch
'@sanity-labs/groq-lsp': patch
---

Update `groq-js` to ^2.0.2. A field the schema makes nullable is now typed as non-null under a `defined(field)` or `field != null` filter even when the filter has terms that cannot be decided, such as `_type == $type`, and `defined(path.to.field)` narrows a path through a named type.
