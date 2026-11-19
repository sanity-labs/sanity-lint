---
'@sanity-labs/groq-lsp': patch
---

Field, projection key and custom function call hovers now read the query's syntax tree, in the scopes groq-js evaluates it in, so they show the type the generated `QueryResponse` gives that part of the query. Before, the hover rebuilt the scopes from the text around the cursor. That failed on queries whose root is an object, as in `{"slugs": *[…]{…}}{…}.slugs`, where hovers fell back to the type of the whole query. It also failed after a `//` comment with an apostrophe in it. A field in a `select()` alternative or in a conditional `condition => {…}` attribute is now read only for the document types its condition keeps, as groq-js reads it. A field the schema does not have hovers as `null`, as in the generated types, instead of as the whole query. `true`, `false` and `null` hover as literals, and `in`, `match`, `asc` and `desc` show no hover.
