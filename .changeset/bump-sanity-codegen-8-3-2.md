---
'@sanity-labs/groq-lint': patch
---

Update `@sanity/codegen` to ^8.3.2, which depends on `groq-js` ^2.0.2, so installs no longer pull in a second, older `groq-js` without `defined()` filter narrowing.
