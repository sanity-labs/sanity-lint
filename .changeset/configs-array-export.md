---
'eslint-plugin-sanity': patch
---

Export configs as arrays for easier spreading

`sanity.configs.recommended` and `sanity.configs.strict` are now arrays,
allowing users to use either syntax:

```js
// Both of these now work:
export default [...sanity.configs.recommended]
export default [sanity.configs.recommended]  // ESLint flattens nested arrays
```

This follows the convention used by other ESLint plugins and prevents the
"is not iterable" error when users spread the config.
