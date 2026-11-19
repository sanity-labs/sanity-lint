---
'@sanity-labs/groq-lsp': patch
---

Hovering inside a `select()` value at the top of a query, as in `select(defined(*[…][0]) => *[…]{…}, [])`, shows the types of its fields and keys again. groq-js types no `select()` value there, so the generated types have only the fallback and these hovers had no type. The hover now reads such a value wherever its condition may hold.
