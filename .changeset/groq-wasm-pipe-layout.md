---
'@sanity-labs/groq-wasm': patch
---

`format()` keeps a `|` pipeline on one line when it fits, and otherwise puts each stage on its own line with a leading `|`. A trailing slice or projection stays on the last stage.
