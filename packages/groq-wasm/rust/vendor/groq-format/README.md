# Vendored groq-format

Copy of the library half of [atombender/groq-format](https://github.com/atombender/groq-format)
at `1abd1ed972593f80f8c6eb27a3cbad2f8e1e6c4a` (CLI and tests dropped), used through the
`[patch]` in `../../Cargo.toml`.

Local change: `format_dot` in `src/format.rs` keeps bracket notation (`a["b-c"]`,
`a->["b-c"]`) when the attribute name is not a valid GROQ identifier. Printing it as
`a.b-c` re-parses as subtraction or fails to parse.

Remove this directory and the `[patch]` once the fix lands in atombender/groq-format.
