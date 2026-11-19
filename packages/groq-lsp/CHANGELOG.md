# @sanity/groq-lsp

## 1.3.0

### Minor Changes

- df10e1a: `format()` formats a GROQ document of only `fn` definitions, like a `.groq` file of shared custom functions, instead of failing to parse it. groq-lint exports `isDefinitionsOnly()`, also from `@sanity-labs/groq-lint/definitions` without WASM. groq-lsp adds go to definition and find references for custom functions, and a `@sanity-labs/groq-lsp/functions` entry with groq-content-mapper's settings, `withGroqFunctions()` and the definitions and calls in GROQ source, without WASM.

### Patch Changes

- 9ab485d: With a schema, hovering the name, the `::`, the `(` or the closing `)` of a custom GROQ function call such as `image::field(coverImage)` now shows the type the call resolves to (`image::field: { crop: object, hotspot: object, asset: object }`), computed from the function's definition and the type of its argument. Nested calls resolve too. Hovering an argument still shows the field's own type, and without a schema the hover is unchanged.
- 536b9d8: Schema-aware hover now prints the full shape of an object type instead of the word `object`, for fields, custom function calls and every other hover that shows a type. Attributes are listed recursively with optional ones marked `?`, string literals such as `_type: "sanity.imageCrop"`, named types expanded from the schema and `| null` where a value can be null. Arrays show as `Array<…>`. Output is bounded: objects nested more than six levels deep, attributes past the first 40 of an object or past 300 in all, and types that contain themselves are cut short or shown by name, and the hover says so.

  `slug.current` and other paths now hover with the type of the attribute (`string | null`) instead of falling back to the type of the whole query (`object | null`). Optional attributes and paths through a possibly missing value include `| null`. Fields are now also resolved inside `| order(…)` and `| score(…)`, after a projection, through `@`, and through `^` for the parent scope.

- Updated dependencies [df10e1a]
  - @sanity-labs/groq-wasm@1.2.4
  - @sanity-labs/groq-lint@1.2.0

## 1.2.3

### Patch Changes

- Updated dependencies [c67dde7]
  - @sanity-labs/groq-lint@1.1.0

## 1.2.2

### Patch Changes

- b6744f2: Hover over a field in a GROQ query now shows the type the schema gives that field (`title: string`) instead of the type of the whole query (`title: object | null`). `_type` hovers as the document type name the query filters to (`page`, or `page | post` for OR-ed filters), both in the filter and in a projection. Without a schema, or for a field the schema does not have, hover is unchanged.

## 1.2.1

### Patch Changes

- f2a88ac: Build with tsdown instead of tsup. Entry points, exports, `.d.ts` files and the `wasm` folder are unchanged; internal chunk file names differ, and built-in imports keep their `node:` prefix.
- 0cac734: Completion lists each field once. Schemas from `sanity schema extract` declare system fields such as `_id`, `_rev` and `_createdAt`, which used to appear twice next to the built-in system field items.
- 3ea987f: author: @452740336
  author: @Omission-create
  author: @rock2089
  author: @XananasX7

  Link each package's npm page to its README and the issue tracker.

- Updated dependencies [f2a88ac]
- Updated dependencies [3ea987f]
  - @sanity-labs/lint-core@1.0.2
  - @sanity-labs/groq-lint@1.0.11
  - @sanity-labs/groq-wasm@1.2.3

## 1.2.0

### Minor Changes

- 2c84276: Lint queries that interpolate fragments, such as ``defineQuery(`*[_type == "article"]{ author->${author} }`)``, with the fragments inlined instead of reporting a parse error. Fragments are followed into the files they are imported from, including tsconfig `paths` and workspace packages in `node_modules`, and editing an open fragment re-lints the queries that use it. A query with a `${}` that cannot be resolved is not linted. The resolver is also exported from `@sanity-labs/groq-lsp/fragments`.

  author: @torjusb

### Patch Changes

- 28ebc5f: `repeated-dereference` counts each nested projection, `[]` map and filter on its own, so `asset->` in sibling sub-projections, or in custom functions inlined at several calls, is no longer reported as dereferencing the same reference twice, once per enclosing projection.

  The language server no longer reports findings in the bodies of prepended groq-content-mapper functions on the calling query. It reports them on the function's name where it is defined, in its functions file or in the query that defines it.

- 4947f2c: A GROQ document of only `fn` definitions (and comments), like a `.groq` file of shared custom functions, is no longer a syntax error.
- c9ba87c: `groq` followed by a backtick in a comment or string, as in ``// the `.groq` loader``, is no longer linted as a GROQ query and reported as a syntax error. Only `groq` tags, `defineQuery()` calls and `/* groq */` markers in code are extracted.
- Updated dependencies [28ebc5f]
- Updated dependencies [4947f2c]
  - @sanity-labs/groq-lint@1.0.10

## 1.1.0

### Minor Changes

- 5cd98c5: Read groq-content-mapper's settings from the `tsconfig.json` nearest each document. When neither the `schemaPath` setting nor a well-known schema file in the workspace gives a schema, the mapper's `schema` or `schemas` option does. Queries in `.groq` files that call shared custom GROQ functions from the mapper's `functions` option are linted and hovered with the definitions they need prepended, as the mapper's loaders deliver them, instead of failing to parse.

### Patch Changes

- Updated dependencies [4d12bab]
  - @sanity-labs/groq-wasm@1.2.2
  - @sanity-labs/groq-lint@1.0.9

## 1.0.11

### Patch Changes

- 526e05f: Fix three language server bugs:

  - Formatting a `.groq` file that starts with blank lines (or indentation) now replaces the correct range, and diagnostics for such files report correct line and column positions.
  - Queries wrapped in `defineQuery(`...`)` and preceded by a `/* groq */` comment are now linted, hovered, completed and formatted, in addition to `groq` tagged templates.
  - The server now handles `workspace/didChangeWatchedFiles` for schema files: it reloads or clears the schema and re-lints open documents, and registers watchers for well-known schema locations when the client supports dynamic registration.

- af8ce20: Format GROQ by calling `format` from `@sanity-labs/groq-wasm` directly instead of going through Prettier and `@sanity-labs/prettier-plugin-groq`. Formatting now follows the editor's `tabSize`, and uses tabs when `insertSpaces` is `false`; before, it always indented with two spaces. `printWidth` is passed to groq-format as the line width. `prettier` and `@sanity-labs/prettier-plugin-groq` are no longer dependencies.

## 1.0.10

### Patch Changes

- @sanity-labs/groq-lint@1.0.8
  - @sanity-labs/prettier-plugin-groq@1.0.9

## 1.0.9

### Patch Changes

- @sanity-labs/groq-lint@1.0.7
  - @sanity-labs/prettier-plugin-groq@1.0.8

## 1.0.8

### Patch Changes

- @sanity-labs/groq-lint@1.0.6
  - @sanity-labs/prettier-plugin-groq@1.0.7

## 1.0.7

### Patch Changes

- 046db4e: Fix `invalid-type-filter` false positives for `_type` filters on array items (#27). Document filters (`*[...]`) are still validated against document types, while filters on arrays such as `content[_type == "imageBlock"]` are now validated against the member types allowed in that array (including inline object members and arrays reached through projections and dereferences). Comparisons whose context type cannot be determined from the schema are skipped.
- Updated dependencies [046db4e]
  - @sanity-labs/groq-lint@1.0.5
  - @sanity-labs/prettier-plugin-groq@1.0.6

## 1.0.6

### Patch Changes

- @sanity-labs/groq-lint@1.0.4
  - @sanity-labs/prettier-plugin-groq@1.0.5

## 1.0.5

### Patch Changes

- b7c3c9a: Update dependencies: `groq-js` ^1.30.3, `@sanity/codegen` ^5.10.1, `prettier` ^3.9.10, `vscode-languageserver` ^10.1.2, `vscode-languageserver-textdocument` ^1.0.15 and `vscode-uri` ^3.2.0.
- Updated dependencies [b7c3c9a]
  - @sanity-labs/lint-core@1.0.1
  - @sanity-labs/groq-lint@1.0.3
  - @sanity-labs/prettier-plugin-groq@1.0.4

## 1.0.4

### Patch Changes

- @sanity-labs/groq-lint@1.0.2
  - @sanity-labs/prettier-plugin-groq@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [f1062e2]
  - @sanity-labs/groq-lint@1.0.1
  - @sanity-labs/prettier-plugin-groq@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [7fbee03]
  - @sanity-labs/prettier-plugin-groq@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [042b456]
  - @sanity-labs/prettier-plugin-groq@1.0.1

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
  - @sanity-labs/prettier-plugin-groq@1.0.0
  - @sanity-labs/groq-lint@1.0.0
  - @sanity-labs/lint-core@1.0.0

## 0.2.0

### Minor Changes

- c872504: Upgrade groq-wasm to latest version

### Patch Changes

- Updated dependencies [c872504]
  - @sanity-labs/lint-core@0.2.0
  - @sanity-labs/groq-lint@0.2.0
  - @sanity-labs/prettier-plugin-groq@0.2.0

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
  - @sanity-labs/groq-lint@0.1.0
  - @sanity-labs/prettier-plugin-groq@0.1.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`10068a2`](https://github.com/sanity-io/sanity-lint/commit/10068a2ab9b0f3fdc4a60e4f933b12f595e10115)]:
  - @sanity/lint-core@0.0.3
  - @sanity/groq-lint@0.0.3
  - @sanity/prettier-plugin-groq@0.0.2

## 0.0.3

### Patch Changes

- Updated dependencies [[`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66)]:
  - @sanity/groq-lint@0.0.2
  - @sanity/lint-core@0.0.2
  - @sanity/prettier-plugin-groq@0.0.2

## 0.0.2

### Patch Changes

- [#8](https://github.com/sanity-io/sanity-lint/pull/8) [`770edb5`](https://github.com/sanity-io/sanity-lint/commit/770edb5d80e69fce0738e513f76ff0265da0f11b) Thanks [@kmelve](https://github.com/kmelve)! - Fix LSP server scanning files in node_modules

  The language server now skips files in `node_modules` directories, preventing
  unnecessary diagnostics and errors from third-party package type definitions.
