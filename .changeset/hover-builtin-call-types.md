---
'@sanity-labs/groq-lsp': patch
---

Hovering a call to a built-in GROQ function, such as `count(…)`, `defined(…)`, `coalesce(…)`, `select(…)` or `pt::text(…)`, now shows what the call returns, as the generated types have it, next to the function's documentation. A pipe function such as `| order(…)` shows the array it returns. Before, these hovers showed only the documentation.
