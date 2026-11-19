---
'@sanity-labs/groq-lsp': patch
---

Hovering the start of a chain that goes on after it now shows its type, as the generated types have it, instead of only its name. That covers `slug` in `*[_type == "post"].slug.current` or in `showcaseProjects[]->slug.current`, a pipe function that a projection, slice or index follows, as `order` in `*[…] | order(…) {…}`, and a field that a shorthand attribute indexes, maps or projects, as `tags` in `{tags[0]}` or `{tags[]}`.
