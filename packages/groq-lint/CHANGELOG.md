# @sanity/groq-lint

## 1.3.5

### Patch Changes

- Updated dependencies [f5e6548]
  - @sanity-labs/groq-wasm@1.2.7

## 1.3.4

### Patch Changes

- Updated dependencies [286428f]
  - @sanity-labs/groq-wasm@1.2.6

## 1.3.3

### Patch Changes

- Updated dependencies [ad96464]
- Updated dependencies [8d655ea]
  - @sanity-labs/groq-wasm@1.2.5
  - @sanity-labs/lint-core@1.0.5

## 1.3.2

### Patch Changes

- 32fff29: Update `groq-js` to ^2.0.3. `select()` at the root of a query now types every alternative whose condition can be true, instead of only the fallback: `{"v": select(true => "many", "few")}` hovers as `"many"`, and `select($x == 1 => "a", "b")` as `"a" | "b"`. A `select()` with no fallback is nullable when it is not guaranteed to match an alternative, since it evaluates to `null` then: `select(views > 10 => "many")` hovers as `"many" | null`, while `select(true => "many")` stays `"many"`.
- Updated dependencies [32fff29]
  - @sanity-labs/lint-core@1.0.4
  - @sanity-labs/groq-wasm@1.2.4

## 1.3.1

### Patch Changes

- a202095: Update `groq-js` to ^2.0.2. A field the schema makes nullable is now typed as non-null under a `defined(field)` or `field != null` filter even when the filter has terms that cannot be decided, such as `_type == $type`, and `defined(path.to.field)` narrows a path through a named type.
- 644a1ac: Update `@sanity/codegen` to ^8.3.2, which depends on `groq-js` ^2.0.2, so installs no longer pull in a second, older `groq-js` without `defined()` filter narrowing.
- Updated dependencies [a202095]
  - @sanity-labs/lint-core@1.0.3
  - @sanity-labs/groq-wasm@1.2.4

## 1.3.0

### Minor Changes

- 6528354: Hovering a field inside a filter `[]` now shows the type it can have before the filter is applied, instead of the type the filter narrows it to. `_type` in `*[_type == "post"]` hovers as every document type in the schema, while `_type` in the projection `*[_type == "post"]{_type}` is narrowed to `"post"` (and to `"post" | "author"` for `_type in ["post", "author"]`). `invalid-type-filter` now also checks the names in `_type in [...]` comparisons.

  Thanks to Cody Olsen for the report.

## 1.2.0

### Minor Changes

- df10e1a: `format()` formats a GROQ document of only `fn` definitions, like a `.groq` file of shared custom functions, instead of failing to parse it. groq-lint exports `isDefinitionsOnly()`, also from `@sanity-labs/groq-lint/definitions` without WASM. groq-lsp adds go to definition and find references for custom functions, and a `@sanity-labs/groq-lsp/functions` entry with groq-content-mapper's settings, `withGroqFunctions()` and the definitions and calls in GROQ source, without WASM.

### Patch Changes

- Updated dependencies [df10e1a]
  - @sanity-labs/groq-wasm@1.2.4

## 1.1.0

### Minor Changes

- c67dde7: Add the `duplicate-projection-key` rule. It reports an error when one projection object writes the same key more than once, like `"body": image::richText(body)` followed by `body`, where only the last one is kept. Spreads and conditional spreads are not explicit keys, and nested objects are checked on their own. The ESLint plugin enables `sanity/groq-duplicate-projection-key` as an error in its `recommended` and `groq` configs.

## 1.0.11

### Patch Changes

- f2a88ac: Build with tsdown instead of tsup. Entry points, exports, `.d.ts` files and the `wasm` folder are unchanged; internal chunk file names differ, and built-in imports keep their `node:` prefix.
- 3ea987f: author: @452740336
  author: @Omission-create
  author: @rock2089
  author: @XananasX7

  Link each package's npm page to its README and the issue tracker.

- Updated dependencies [f2a88ac]
- Updated dependencies [3ea987f]
  - @sanity-labs/lint-core@1.0.2
  - @sanity-labs/groq-wasm@1.2.3

## 1.0.10

### Patch Changes

- 28ebc5f: `repeated-dereference` counts each nested projection, `[]` map and filter on its own, so `asset->` in sibling sub-projections, or in custom functions inlined at several calls, is no longer reported as dereferencing the same reference twice, once per enclosing projection.

  The language server no longer reports findings in the bodies of prepended groq-content-mapper functions on the calling query. It reports them on the function's name where it is defined, in its functions file or in the query that defines it.

- 4947f2c: A GROQ document of only `fn` definitions (and comments), like a `.groq` file of shared custom functions, is no longer a syntax error.

## 1.0.9

### Patch Changes

- Updated dependencies [4d12bab]
  - @sanity-labs/groq-wasm@1.2.2

## 1.0.8

### Patch Changes

- Updated dependencies [fe24ad9]
- Updated dependencies [52296ca]
  - @sanity-labs/groq-wasm@1.2.1

## 1.0.7

### Patch Changes

- Updated dependencies [3a5ccda]
- Updated dependencies [51f9241]
  - @sanity-labs/groq-wasm@1.2.0

## 1.0.6

### Patch Changes

- Updated dependencies [2f46aef]
  - @sanity-labs/groq-wasm@1.1.1

## 1.0.5

### Patch Changes

- 046db4e: Fix `invalid-type-filter` false positives for `_type` filters on array items (#27). Document filters (`*[...]`) are still validated against document types, while filters on arrays such as `content[_type == "imageBlock"]` are now validated against the member types allowed in that array (including inline object members and arrays reached through projections and dereferences). Comparisons whose context type cannot be determined from the schema are skipped.
- Updated dependencies [9a4a5fc]
- Updated dependencies [16500f8]
- Updated dependencies [e0b0c41]
- Updated dependencies [8eb11c7]
- Updated dependencies [c6eb248]
  - @sanity-labs/groq-wasm@1.1.0

## 1.0.4

### Patch Changes

- Updated dependencies [5d1411a]
  - @sanity-labs/groq-wasm@1.0.3

## 1.0.3

### Patch Changes

- b7c3c9a: Update dependencies: `groq-js` ^1.30.3, `@sanity/codegen` ^5.10.1, `prettier` ^3.9.10, `vscode-languageserver` ^10.1.2, `vscode-languageserver-textdocument` ^1.0.15 and `vscode-uri` ^3.2.0.
- Updated dependencies [b7c3c9a]
  - @sanity-labs/lint-core@1.0.1
  - @sanity-labs/groq-wasm@1.0.2

## 1.0.2

### Patch Changes

- Updated dependencies [8a41ec8]
  - @sanity-labs/groq-wasm@1.0.2

## 1.0.1

### Patch Changes

- f1062e2: Update the Rust dependencies behind the WASM bindings and rebuild the committed `wasm/` artifacts. Upstream `groq-lint` dropped the `repeated_dereference` rule and added `unlimited_query`, so `repeated-dereference` is now served by the TypeScript implementation in `@sanity-labs/groq-lint` instead of WASM.
- Updated dependencies [f1062e2]
  - @sanity-labs/groq-wasm@1.0.1

## 1.0.0

### Major Changes

- 0742230: BREAKING CHANGE: Minimum Node.js version is now v22.3.0.

  BREAKING CHANGE: Explicit CommonJS builds have been dropped. All supported Node.js versions provide transparent CommonJS/ESM interop, so consumers can `require()` the published ESM directly.

  BREAKING CHANGE: WASM initialization is now handled automatically at import time, so the explicit init/availability APIs have been removed:
  - `@sanity-labs/groq-wasm`: removed `initWasm`, `isInitialized`, `lintAsync`, and `formatAsync`. Use `lint` and `format` directly.
  - `@sanity-labs/groq-lint`: removed `initLinter` and `isWasmAvailable`.
  - `@sanity-labs/prettier-plugin-groq`: removed `initWasmFormatter`, `isWasmFormatterAvailable`, and `createGroqPrinter`. The plugin can be used immediately after import with no async bootstrap.

### Patch Changes

- Updated dependencies [0742230]
  - @sanity-labs/groq-wasm@1.0.0
  - @sanity-labs/lint-core@1.0.0

## 0.2.0

### Minor Changes

- c872504: Upgrade groq-wasm to latest version

### Patch Changes

- Updated dependencies [c872504]
  - @sanity-labs/lint-core@0.2.0
  - @sanity-labs/groq-wasm@0.3.0

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

### Patch Changes

- Updated dependencies [06a5052]
  - @sanity-labs/lint-core@0.1.0
  - @sanity-labs/groq-wasm@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`10068a2`](https://github.com/sanity-io/sanity-lint/commit/10068a2ab9b0f3fdc4a60e4f933b12f595e10115)]:
  - @sanity/lint-core@0.0.3
  - @sanity/groq-wasm@0.0.1

## 0.0.2

### Patch Changes

- [#11](https://github.com/sanity-io/sanity-lint/pull/11) [`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66) Thanks [@kmelve](https://github.com/kmelve)! - Add CommonJS exports to all library packages

  All library packages now export both ESM and CJS formats, fixing compatibility
  issues with ESLint configurations that use `require()` or FlatCompat.
  - @sanity/lint-core: ESM + CJS
  - @sanity/groq-lint: ESM + CJS (library), ESM only (CLI)
  - @sanity/schema-lint: ESM + CJS
  - @sanity/prettier-plugin-groq: ESM + CJS

- Updated dependencies [[`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66)]:
  - @sanity/lint-core@0.0.2
  - @sanity/groq-wasm@0.0.1
