---
'@sanity-labs/groq-wasm': patch
---

Link one `groq-parser` revision (`da4fae6`) into the WASM build. `groq-format` previously pinned `82e343c` while `groq-lint` followed `groq-parser` main, so the binary contained the parser twice.
