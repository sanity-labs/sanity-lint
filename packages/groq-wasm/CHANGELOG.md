# @sanity-labs/groq-wasm

## 1.3.1

### Patch Changes

- 5bc2c27: The query plan lint rules now come from Rust groq-lint instead of copies in this package. Findings are unchanged.
- 4d97f21: `format()` lays out a `|` pipe chain all-or-nothing. A chain that fits stays on one line, and otherwise every stage goes on its own line with a leading `|`, instead of keeping the first stage on the opening line.

## 1.3.0

### Minor Changes

- 81c7a36: Lint findings now match how the Content Lake query planner runs a query.

  - `count-in-correlated-subquery` only reports a correlated `count()` whose `^` condition is not `==` or `references()`. Equality and `references()` subqueries are batched into one index read.
  - `deep-pagination`, `deep-pagination-param` and `large-pages` no longer report slices of one document's attribute array. `deep-pagination` now reports a start of exactly 1000 and element access such as `[5000]`, and `deep-pagination-param` reports `[$start]`.
  - `non-literal-comparison` treats `dateTime("…")` as a literal and `lower(^.name)` as a batch key.
  - `join-in-filter` no longer reports joins inside a filter over an attribute array in a projection, and suggests `a._ref in *[b == "c"]._id` instead of a `count()` rewrite that still filters in memory.
  - `many-joins` counts distinct references, so `author->name` repeated in several fields counts once.
  - `computed-value-in-filter` reports `upper()`, `length()`, `round()`, `coalesce()`, `select()`, `string::split(...)[i]` and `defined(arr[i])` in a filter over documents.
  - `@sanity-labs/groq-lint` now returns `deep-pagination-param` findings from WASM.

### Patch Changes

- 6413dec: A `|` stage now stays on the current line when it fits and breaks only when it overflows.

## 1.2.7

### Patch Changes

- f5e6548: `format()` keeps a `|` pipeline on one line when it fits, and otherwise puts each stage on its own line with a leading `|`. A trailing slice or projection stays on the last stage.

## 1.2.6

### Patch Changes

- 286428f: `format()` uses a new groq-format layout for filters, projections and calls. There is no space between `->` and a projection (`$asset->{ url }`), a projection that does not fit the line width breaks one member per line, and a trailing `//` comment stays on the line it follows.

## 1.2.5

### Patch Changes

- ad96464: Update Rust dependencies in `Cargo.lock`:

  - `clap` 4.6.8 -> 4.6.9
  - `clap_derive` 4.6.8 -> 4.6.9
  - `hashbrown` 0.17.1 -> 0.17.2

## 1.2.4

### Patch Changes

- df10e1a: `format()` formats a GROQ document of only `fn` definitions, like a `.groq` file of shared custom functions, instead of failing to parse it. groq-lint exports `isDefinitionsOnly()`, also from `@sanity-labs/groq-lint/definitions` without WASM. groq-lsp adds go to definition and find references for custom functions, and a `@sanity-labs/groq-lsp/functions` entry with groq-content-mapper's settings, `withGroqFunctions()` and the definitions and calls in GROQ source, without WASM.

## 1.2.3

### Patch Changes

- f2a88ac: Build with tsdown instead of tsup. Entry points, exports, `.d.ts` files and the `wasm` folder are unchanged; internal chunk file names differ, and built-in imports keep their `node:` prefix.
- 3ea987f: author: @452740336
  author: @Omission-create
  author: @rock2089
  author: @XananasX7

  Link each package's npm page to its README and the issue tracker.

## 1.2.2

### Patch Changes

- 4d12bab: Type `initWasm(response)` as returning a `Promise` when given a fetch `Response`. The overloads were checked in the wrong order, so TypeScript matched every object to the synchronous overload and typed the call as `void`. `initWasm` also recognizes a `Response` by shape now instead of with `instanceof`, so a `Response` from another realm or a fetch polyfill takes the asynchronous path too.

## 1.2.1

### Patch Changes

- fe24ad9: Update Rust dependencies in `Cargo.lock`:

  - `bumpalo` 3.20.3 -> 3.20.4
  - `errno` 0.3.14 -> 0.3.15

- 52296ca: Update Rust dependencies in `Cargo.lock`:

  - `clap` 4.6.7 -> 4.6.8
  - `clap_derive` 4.6.7 -> 4.6.8
  - `clap_lex` 1.1.1 -> 1.1.2
  - `groq-format` (git) 1abd1ed -> 7413a01
  - `smallvec` 1.16.5 -> 1.16.6

## 1.2.0

### Minor Changes

- 51f9241: Add `@sanity-labs/groq-wasm/lazy` for bundlers that cannot handle top-level await. It exports the same API as the main entry, plus `load()` and `initWasm()`, and does not fetch or compile the WebAssembly module until one of those is called. `load()` fetches the packaged `.wasm` once, including when several callers race. `initWasm()` accepts bytes, a `Response`, or a `WebAssembly.Module`. Using `lint`, `format`, `validate`, `extractParams`, or `isValidSyntax` before initialization throws `WasmError` with code `NOT_INITIALIZED`. The raw module is exported at `@sanity-labs/groq-wasm/wasm`. The default entry still initializes on import and does not export `load` or `initWasm`.

### Patch Changes

- 3a5ccda: Update Rust dependencies in `Cargo.lock`:

  - `addr2line` 0.25.1 -> 0.27.1
  - `backtrace` 0.3.76 -> 0.3.77
  - `gimli` 0.32.3 -> 0.34.0
  - `itoa` 1.0.18 -> 1.0.19
  - `miniz_oxide` 0.8.9 -> 0.9.1
  - `object` 0.37.3 -> 0.40.0
  - `rustix` 1.1.5 -> 1.1.6
  - `smallvec` 1.16.3 -> 1.16.5
  - `syn` 3.0.9 -> 3.0.10
  - `unicode-width` 0.2.2 -> 0.2.3
  - `utf8_iter` 1.0.4 -> 1.1.0
  - `utf_types` 1.0.0 (added)
  - `wasm-bindgen` 0.2.129 -> 0.2.130
  - `wasm-bindgen-macro` 0.2.129 -> 0.2.130
  - `wasm-bindgen-macro-support` 0.2.129 -> 0.2.130
  - `wasm-bindgen-shared` 0.2.129 -> 0.2.130

## 1.1.1

### Patch Changes

- 2f46aef: Drop the `[patch]` that forced one `groq-parser` revision. `groq-format` now tracks `groq-parser` main like `groq-lint`, so Cargo resolves a single `groq-parser` (`da4fae6`) on its own.

  Update Rust dependencies in `Cargo.lock`:

  - `groq-format` (git) 03fbdfd -> 1abd1ed

## 1.1.0

### Minor Changes

- 16500f8: Add `extractParams(query)`, which lists the `$parameters` a GROQ query references using groq-parser. It returns one entry per distinct name (without the `$`) in order of first reference, each with every reference's `start` / `end` as UTF-16 code unit indices and 1-based line and column for both ends. Custom function parameters are excluded inside their function body. An empty query returns `[]`, and invalid syntax throws `WasmError` with code `PARSE_ERROR`, like `lint` and `format`. Existing APIs are unchanged.
- 8eb11c7: Add `validate(query)`, which parses a GROQ query and returns `{ ok: true }` or a syntax error. The error includes the parser message, inclusive/exclusive `start` and `end` as UTF-16 code unit indices, and 1-based line and column for both ends. Existing `lint`, `format`, and `isValidSyntax` behavior is unchanged.

### Patch Changes

- 9a4a5fc: Update Rust dependencies in `Cargo.lock`:

  - `groq-parser` (git) 216445b -> da4fae6

- e0b0c41: Fix line and column positions for lint findings in queries that contain non-ASCII text. Spans from the Rust linter are UTF-8 byte offsets; columns are now 1-based UTF-16 code units (the unit CodeMirror, Monaco, and LSP use) and `offset` is the matching JavaScript string index.
- c6eb248: Link one `groq-parser` revision (`da4fae6`) into the WASM build. `groq-format` previously pinned `82e343c` while `groq-lint` followed `groq-parser` main, so the binary contained the parser twice.

## 1.0.3

### Patch Changes

- 5d1411a: Update Rust dependencies in `Cargo.lock`:

  - `icu_collections` 2.3.0 -> 2.4.0
  - `icu_locale_core` 2.3.0 -> 2.4.0
  - `icu_locale_fallback` 2.3.0 -> 2.4.0
  - `icu_locale_fallback_data` 2.3.0 -> 2.4.0
  - `icu_provider` 2.3.1 -> 2.4.0
  - `icu_segmenter` 2.3.0 -> 2.4.0
  - `icu_segmenter_data` 2.3.0 -> 2.4.0
  - `tinystr` 0.8.4 -> 0.8.5
  - `yoke` 0.8.3 -> 0.8.4
  - `zerovec` 0.11.8 -> 0.11.9
  - `zerovec-derive` 0.11.6 -> 0.11.7

## 1.0.2

### Patch Changes

- 8a41ec8: Update Rust dependencies in `Cargo.lock` (#66):

  - `equivalent` 1.0.2 -> 1.0.3
  - `groq-parser` (git) 61b337c -> 216445b
  - `libc` 0.2.190 -> 0.2.191

## 1.0.1

### Patch Changes

- f1062e2: Update the Rust dependencies behind the WASM bindings and rebuild the committed `wasm/` artifacts. Upstream `groq-lint` dropped the `repeated_dereference` rule and added `unlimited_query`, so `repeated-dereference` is now served by the TypeScript implementation in `@sanity-labs/groq-lint` instead of WASM.

## 1.0.0

### Major Changes

- 0742230: BREAKING CHANGE: Minimum Node.js version is now v22.3.0.

  BREAKING CHANGE: Explicit CommonJS builds have been dropped. All supported Node.js versions provide transparent CommonJS/ESM interop, so consumers can `require()` the published ESM directly.

  BREAKING CHANGE: WASM initialization is now handled automatically at import time, so the explicit init/availability APIs have been removed:
  - `@sanity-labs/groq-wasm`: removed `initWasm`, `isInitialized`, `lintAsync`, and `formatAsync`. Use `lint` and `format` directly.
  - `@sanity-labs/groq-lint`: removed `initLinter` and `isWasmAvailable`.
  - `@sanity-labs/prettier-plugin-groq`: removed `initWasmFormatter`, `isWasmFormatterAvailable`, and `createGroqPrinter`. The plugin can be used immediately after import with no async bootstrap.

## 0.3.0

### Minor Changes

- c872504: Upgrade groq-wasm to latest version

## 0.1.0

### Minor Changes

- 06a5052: Rename all packages from `@sanity/*` to `@sanity-labs/*` scope

  This is a breaking change that renames all packages to the new npm organization:
  - `@sanity/lint-core` → `@sanity-labs/lint-core`
  - `@sanity/groq-wasm` → `@sanity-labs/groq-wasm`
  - `@sanity/groq-lint` → `@sanity-labs/groq-lint`
  - `@sanity/schema-lint` → `@sanity-labs/schema-lint`
  - `@sanity/groq-lsp` → `@sanity-labs/groq-lsp`
  - `@sanity/eslint-plugin` → `@sanity-labs/eslint-plugin`
  - `@sanity/prettier-plugin-groq` → `@sanity-labs/prettier-plugin-groq`

  To migrate, update your imports and dependencies:

  ```diff
  - npm install @sanity/eslint-plugin
  + npm install @sanity-labs/eslint-plugin
  ```

  ```diff
  - import sanity from '@sanity/eslint-plugin'
  + import sanity from '@sanity-labs/eslint-plugin'
  ```
