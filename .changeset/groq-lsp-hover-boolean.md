---
'@sanity-labs/groq-lsp': patch
---

Hover prints `boolean` instead of `false | true` or `true | false`, including inside larger unions such as `boolean | null` and in nested object fields, as `@sanity/codegen` does. A type that is only `true` or only `false` still prints as that literal.
