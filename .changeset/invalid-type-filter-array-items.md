---
'@sanity-labs/groq-lint': patch
'@sanity-labs/eslint-plugin': patch
'@sanity-labs/groq-lsp': patch
---

Fix `invalid-type-filter` false positives for `_type` filters on array items (#27). Document filters (`*[...]`) are still validated against document types, while filters on arrays such as `content[_type == "imageBlock"]` are now validated against the member types allowed in that array (including inline object members and arrays reached through projections and dereferences). Comparisons whose context type cannot be determined from the schema are skipped.
