---
'@sanity-labs/groq-wasm': patch
---

Type `initWasm(response)` as returning a `Promise` when given a fetch `Response`. The overloads were checked in the wrong order, so TypeScript matched every object to the synchronous overload and typed the call as `void`. `initWasm` also recognizes a `Response` by shape now instead of with `instanceof`, so a `Response` from another realm or a fetch polyfill takes the asynchronous path too.
