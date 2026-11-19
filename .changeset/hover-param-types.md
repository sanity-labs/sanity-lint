---
'@sanity-labs/groq-lsp': patch
---

Hovering a query parameter such as `$slug` now shows the type the query uses it as, instead of the type of the whole query. The type is inferred from how the parameter is used: compared (`==`, `!=`, `<`, `>`, `<=`, `>=`) or tested with `in` against a field the schema types, matched with `match` (a string), or used as an index or slice bound (a number). `null` is left out of the type of the field it is compared to, and a parameter nothing types hovers as `unknown`.

Thanks to Cody Olsen for the report.
