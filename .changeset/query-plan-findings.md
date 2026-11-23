---
'@sanity-labs/groq-wasm': minor
'@sanity-labs/groq-lint': minor
---

Lint findings now match how the Content Lake query planner runs a query.

- `count-in-correlated-subquery` only reports a correlated `count()` whose `^` condition is not `==` or `references()`. Equality and `references()` subqueries are batched into one index read.
- `deep-pagination`, `deep-pagination-param` and `large-pages` no longer report slices of one document's attribute array. `deep-pagination` now reports a start of exactly 1000 and element access such as `[5000]`, and `deep-pagination-param` reports `[$start]`.
- `non-literal-comparison` treats `dateTime("…")` as a literal and `lower(^.name)` as a batch key.
- `join-in-filter` no longer reports joins inside a filter over an attribute array in a projection, and suggests `a._ref in *[b == "c"]._id` instead of a `count()` rewrite that still filters in memory.
- `many-joins` counts distinct references, so `author->name` repeated in several fields counts once.
- `computed-value-in-filter` reports `upper()`, `length()`, `round()`, `coalesce()`, `select()`, `string::split(...)[i]` and `defined(arr[i])` in a dataset filter.
- `@sanity-labs/groq-lint` now returns `deep-pagination-param` findings from WASM.
