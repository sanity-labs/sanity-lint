---
'@sanity-labs/groq-lint': minor
'@sanity-labs/eslint-plugin': minor
---

Add the `duplicate-projection-key` rule. It reports an error when one projection object writes the same key more than once, like `"body": image::richText(body)` followed by `body`, where only the last one is kept. Spreads and conditional spreads are not explicit keys, and nested objects are checked on their own. The ESLint plugin enables `sanity/groq-duplicate-projection-key` as an error in its `recommended` and `groq` configs.
