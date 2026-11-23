---
'@sanity-labs/groq-wasm': patch
---

`format()` lays out a `|` pipe chain all-or-nothing. A chain that fits stays on one line, and otherwise every stage goes on its own line with a leading `|`, instead of keeping the first stage on the opening line.
