---
'@sanity-labs/groq-lsp': patch
---

Hover types now print the way `sanity typegen` and the content mapper generate them. An empty union, such as a Portable Text `listItem` with no list styles, shows as `never` instead of `null`. Number and boolean literals show their value (`3`, `false`). An attribute whose name is not an identifier is quoted (`"my title": string`). The items of an array of named types, such as an array of references, have the `_key: string` that `ArrayOf<…>` adds, and an array of named and other types is shown as one array of each. A type the schema does not have, and an object whose other attributes are unknown, show as `unknown`.
