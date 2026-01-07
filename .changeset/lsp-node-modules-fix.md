---
'@sanity/groq-lsp': patch
---

Fix LSP server scanning files in node_modules

The language server now skips files in `node_modules` directories, preventing
unnecessary diagnostics and errors from third-party package type definitions.
