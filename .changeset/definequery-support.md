---
'eslint-plugin-sanity': minor
---

Add support for `defineQuery()` function calls

The ESLint plugin now detects and lints GROQ queries in `defineQuery()` calls,
which is used by `next-sanity` and other Sanity packages.

Supported patterns:

- `defineQuery(\`\*[_type == "post"]\`)` - template literal argument
- `defineQuery("*[_type == 'post']")` - string literal argument
- `groq(\`...\`)` - groq function call (in addition to tagged templates)

This is in addition to the existing `groq\`...\`` tagged template support.
