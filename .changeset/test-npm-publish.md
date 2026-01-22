---
'@sanity-labs/eslint-plugin': patch
---

docs: document schema-aware GROQ rules in README

Added `groq-invalid-type-filter` and `groq-unknown-field` to the rules documentation. These schema-aware rules catch typos in `_type` filters and field projections by validating against your extracted schema.
