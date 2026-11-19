---
'@sanity-labs/groq-lsp': patch
---

Hover over a field in a GROQ query now shows the type the schema gives that field (`title: string`) instead of the type of the whole query (`title: object | null`). `_type` hovers as the document type name the query filters to (`page`, or `page | post` for OR-ed filters), both in the filter and in a projection. Without a schema, or for a field the schema does not have, hover is unchanged.
