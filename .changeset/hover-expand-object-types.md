---
'@sanity-labs/groq-lsp': patch
---

Schema-aware hover now prints the full shape of an object type instead of the word `object`, for fields, custom function calls and every other hover that shows a type. Attributes are listed recursively with optional ones marked `?`, string literals such as `_type: "sanity.imageCrop"`, named types expanded from the schema and `| null` where a value can be null. Arrays show as `Array<…>`. Output is bounded: objects nested more than six levels deep, attributes past the first 40 of an object or past 300 in all, and types that contain themselves are cut short or shown by name, and the hover says so.

`slug.current` and other paths now hover with the type of the attribute (`string | null`) instead of falling back to the type of the whole query (`object | null`). Optional attributes and paths through a possibly missing value include `| null`. Fields are now also resolved inside `| order(…)` and `| score(…)`, after a projection, through `@`, and through `^` for the parent scope.
