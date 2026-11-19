---
'@sanity-labs/groq-lsp': minor
---

Lint queries that interpolate fragments, such as ``defineQuery(`*[_type == "article"]{ author->${author} }`)``, with the fragments inlined instead of reporting a parse error. Fragments are followed into the files they are imported from, including tsconfig `paths` and workspace packages in `node_modules`, and editing an open fragment re-lints the queries that use it. A query with a `${}` that cannot be resolved is not linted. The resolver is also exported from `@sanity-labs/groq-lsp/fragments`.

author: @torjusb
