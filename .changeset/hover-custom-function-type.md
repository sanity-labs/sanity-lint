---
'@sanity-labs/groq-lsp': patch
---

With a schema, hovering the name, the `::`, the `(` or the closing `)` of a custom GROQ function call such as `image::field(coverImage)` now shows the type the call resolves to (`image::field: { crop: object, hotspot: object, asset: object }`), computed from the function's definition and the type of its argument. Nested calls resolve too. Hovering an argument still shows the field's own type, and without a schema the hover is unchanged.
