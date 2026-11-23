---
'@sanity-labs/groq-wasm': patch
---

`format()` uses a new groq-format layout for filters, projections and calls. There is no space between `->` and a projection (`$asset->{ url }`), a projection that does not fit the line width breaks one member per line, and a trailing `//` comment stays on the line it follows.
