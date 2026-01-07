---
'@sanity/lint-core': patch
---

Widen vitest peer dependency to >=2.0.0

The `/testing` export only uses basic vitest APIs (`describe`, `it`, `expect`) that are
stable across vitest 2.x, 3.x, and 4.x. This allows projects using newer vitest versions
to use `@sanity/lint-core/testing` without peer dependency warnings.
