---
'@sanity-labs/prettier-plugin-groq': patch
---

Fix the embed plugin leaving `$__exprN__` placeholders in the output when a `groq` or `defineQuery` template literal contains `${...}` interpolations. Interpolations are now restored exactly, and the template is left untouched if they cannot be.
