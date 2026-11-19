---
'@sanity-labs/groq-lsp': minor
'@sanity-labs/groq-lint': minor
---

Hovering a field inside a filter `[]` now shows the type it can have before the filter is applied, instead of the type the filter narrows it to. `_type` in `*[_type == "post"]` hovers as every document type in the schema, while `_type` in the projection `*[_type == "post"]{_type}` is narrowed to `"post"` (and to `"post" | "author"` for `_type in ["post", "author"]`). `invalid-type-filter` now also checks the names in `_type in [...]` comparisons.

Thanks to Cody Olsen for the report.
