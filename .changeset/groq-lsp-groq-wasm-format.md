---
'@sanity-labs/groq-lsp': patch
---

Format GROQ by calling `format` from `@sanity-labs/groq-wasm` directly instead of going through Prettier and `@sanity-labs/prettier-plugin-groq`. Formatting now follows the editor's `tabSize`, and uses tabs when `insertSpaces` is `false`; before, it always indented with two spaces. `printWidth` is passed to groq-format as the line width. `prettier` and `@sanity-labs/prettier-plugin-groq` are no longer dependencies.
