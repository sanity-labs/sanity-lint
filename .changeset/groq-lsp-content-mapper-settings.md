---
'@sanity-labs/groq-lsp': minor
---

Read groq-content-mapper's settings from the `tsconfig.json` nearest each document. When neither the `schemaPath` setting nor a well-known schema file in the workspace gives a schema, the mapper's `schema` or `schemas` option does. Queries in `.groq` files that call shared custom GROQ functions from the mapper's `functions` option are linted and hovered with the definitions they need prepended, as the mapper's loaders deliver them, instead of failing to parse.
