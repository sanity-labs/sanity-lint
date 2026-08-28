---
'@sanity-labs/eslint-plugin': patch
'@sanity-labs/schema-lint': patch
---

Accept function (and identifier) `options.source` values for slug fields in `schema-missing-slug-source`, not only string paths. Model `options.source` with Sanity's exported `SlugSourceFn` and `Path` types.
