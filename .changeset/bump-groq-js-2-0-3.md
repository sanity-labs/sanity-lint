---
'@sanity-labs/lint-core': patch
'@sanity-labs/groq-lint': patch
'@sanity-labs/groq-lsp': patch
---

Update `groq-js` to ^2.0.3. `select()` at the root of a query now types every alternative whose condition can be true, instead of only the fallback: `{"v": select(true => "many", "few")}` hovers as `"many"`, and `select($x == 1 => "a", "b")` as `"a" | "b"`. A `select()` with no fallback is nullable when it is not guaranteed to match an alternative, since it evaluates to `null` then: `select(views > 10 => "many")` hovers as `"many" | null`, while `select(true => "many")` stays `"many"`.
