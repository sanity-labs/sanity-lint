---
'@sanity-labs/groq-lsp': patch
---

Fix hovering a string literal showing the type of the whole query. A string such as `"settings"` in `_type == "settings"` now hovers as the literal itself, and a quoted projection or object key such as `"overview"` in `"overview": pt::text(overview)` hovers as the type of its value (`overview: string`).

Thanks to Cody Olsen for the report.
