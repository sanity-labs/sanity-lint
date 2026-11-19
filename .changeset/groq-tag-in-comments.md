---
'@sanity-labs/groq-lsp': patch
---

`groq` followed by a backtick in a comment or string, as in ``// the `.groq` loader``, is no longer linted as a GROQ query and reported as a syntax error. Only `groq` tags, `defineQuery()` calls and `/* groq */` markers in code are extracted.
