---
'@sanity-labs/groq-lint': patch
'@sanity-labs/groq-lsp': patch
---

`repeated-dereference` counts each nested projection, `[]` map and filter on its own, so `asset->` in sibling sub-projections, or in custom functions inlined at several calls, is no longer reported as dereferencing the same reference twice, once per enclosing projection.

The language server no longer reports findings in the bodies of prepended groq-content-mapper functions on the calling query. It reports them on the function's name where it is defined, in its functions file or in the query that defines it.
