---
'@sanity-labs/groq-lsp': patch
---

Hovering the closing parenthesis of a function call now shows what the call returns when its last argument is a number or a parameter. It used to show the argument, so the `)` in `round(views, 2)` showed `2` instead of `round: number`.
