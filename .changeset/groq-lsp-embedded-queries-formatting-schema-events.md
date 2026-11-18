---
'@sanity-labs/groq-lsp': patch
---

Fix three language server bugs:

- Formatting a `.groq` file that starts with blank lines (or indentation) now replaces the correct range, and diagnostics for such files report correct line and column positions.
- Queries wrapped in `defineQuery(`...`)` and preceded by a `/* groq */` comment are now linted, hovered, completed and formatted, in addition to `groq` tagged templates.
- The server now handles `workspace/didChangeWatchedFiles` for schema files: it reloads or clears the schema and re-lints open documents, and registers watchers for well-known schema locations when the client supports dynamic registration.
