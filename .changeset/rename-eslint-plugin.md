---
'@sanity/eslint-plugin': minor
---

Rename package from `eslint-plugin-sanity` to `@sanity/eslint-plugin` for consistency with other `@sanity/*` packages.

**Migration:** Update your imports and package.json:

```diff
- npm install eslint-plugin-sanity
+ npm install @sanity/eslint-plugin
```

```diff
// eslint.config.js
- import sanity from 'eslint-plugin-sanity'
+ import sanity from '@sanity/eslint-plugin'
```
