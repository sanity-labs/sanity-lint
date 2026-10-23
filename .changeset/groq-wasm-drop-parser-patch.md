---
'@sanity-labs/groq-wasm': patch
---

Drop the `[patch]` that forced one `groq-parser` revision. `groq-format` now tracks `groq-parser` main like `groq-lint`, so Cargo resolves a single `groq-parser` (`da4fae6`) on its own.

Update Rust dependencies in `Cargo.lock`:

- `groq-format` (git) 03fbdfd -> 1abd1ed
