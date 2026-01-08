---
'eslint-plugin-sanity': minor
---

Add schema-aware linting support

The ESLint plugin now reads `settings.sanity.schemaPath` and loads the schema to enable
schema-aware GROQ rules:

- `sanity/groq-invalid-type-filter` (error) - Catches typos in `_type == "typo"`
- `sanity/groq-unknown-field` (warn) - Catches unknown fields in projections

These rules silently skip if no schema is configured, so existing setups continue to work.

**Setup:**

```js
// eslint.config.js
export default [
  ...sanity.configs.recommended,
  {
    settings: {
      sanity: {
        schemaPath: './schema.json', // relative to cwd
      },
    },
  },
]
```

Generate `schema.json` with `npx sanity schema extract`.
