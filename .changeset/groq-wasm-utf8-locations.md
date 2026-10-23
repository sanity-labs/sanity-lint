---
'@sanity-labs/groq-wasm': patch
---

Fix line and column positions for lint findings in queries that contain non-ASCII text. Spans from the Rust linter are UTF-8 byte offsets; columns are now 1-based UTF-16 code units (the unit CodeMirror, Monaco, and LSP use) and `offset` is the matching JavaScript string index.
