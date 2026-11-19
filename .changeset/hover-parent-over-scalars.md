---
'@sanity-labs/groq-lsp': patch
---

A field read through `^` in a filter over an array of strings or numbers now hovers with its type, as `tags` does in `tags[@ in ^.tags]` or `count(tags[@ in ^.^.tags]) > 0`. Before, such a hover showed only the field name, because the scope it was read in only had a type for object elements.
