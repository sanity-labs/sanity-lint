# @sanity/groq-lsp

## 1.4.7

### Patch Changes

- Updated dependencies [5bc2c27]
- Updated dependencies [4d97f21]
  - @sanity-labs/groq-wasm@1.3.1
  - @sanity-labs/groq-lint@1.4.1

## 1.4.6

### Patch Changes

- Updated dependencies [6413dec]
- Updated dependencies [81c7a36]
  - @sanity-labs/groq-wasm@1.3.0
  - @sanity-labs/groq-lint@1.4.0

## 1.4.5

### Patch Changes

- Updated dependencies [f5e6548]
  - @sanity-labs/groq-wasm@1.2.7
  - @sanity-labs/groq-lint@1.3.5

## 1.4.4

### Patch Changes

- Updated dependencies [286428f]
  - @sanity-labs/groq-wasm@1.2.6
  - @sanity-labs/groq-lint@1.3.4

## 1.4.3

### Patch Changes

- Updated dependencies [ad96464]
- Updated dependencies [8d655ea]
  - @sanity-labs/groq-wasm@1.2.5
  - @sanity-labs/lint-core@1.0.5
  - @sanity-labs/groq-lint@1.3.3

## 1.4.2

### Patch Changes

- 32fff29: Update `groq-js` to ^2.0.3. `select()` at the root of a query now types every alternative whose condition can be true, instead of only the fallback: `{"v": select(true => "many", "few")}` hovers as `"many"`, and `select($x == 1 => "a", "b")` as `"a" | "b"`. A `select()` with no fallback is nullable when it is not guaranteed to match an alternative, since it evaluates to `null` then: `select(views > 10 => "many")` hovers as `"many" | null`, while `select(true => "many")` stays `"many"`.
- 8c17df3: Hover prints `boolean` instead of `false | true` or `true | false`, including inside larger unions such as `boolean | null` and in nested object fields, as `@sanity/codegen` does. A type that is only `true` or only `false` still prints as that literal.
- 98c33c7: Hovering the closing parenthesis of a function call now shows what the call returns when its last argument is a number or a parameter. It used to show the argument, so the `)` in `round(views, 2)` showed `2` instead of `round: number`.
- Updated dependencies [32fff29]
  - @sanity-labs/lint-core@1.0.4
  - @sanity-labs/groq-lint@1.3.2
  - @sanity-labs/groq-wasm@1.2.4

## 1.4.1

### Patch Changes

- a202095: Update `groq-js` to ^2.0.2. A field the schema makes nullable is now typed as non-null under a `defined(field)` or `field != null` filter even when the filter has terms that cannot be decided, such as `_type == $type`, and `defined(path.to.field)` narrows a path through a named type.
- a15de47: Hovering a call to a built-in GROQ function, such as `count(…)`, `defined(…)`, `coalesce(…)`, `select(…)` or `pt::text(…)`, now shows what the call returns, as the generated types have it, next to the function's documentation. A pipe function such as `| order(…)` shows the array it returns. Before, these hovers showed only the documentation.
- 81e372b: Hovering the start of a chain that goes on after it now shows its type, as the generated types have it, instead of only its name. That covers `slug` in `*[_type == "post"].slug.current` or in `showcaseProjects[]->slug.current`, a pipe function that a projection, slice or index follows, as `order` in `*[…] | order(…) {…}`, and a field that a shorthand attribute indexes, maps or projects, as `tags` in `{tags[0]}` or `{tags[]}`.
- f5f2690: String and number literals now hover as the generated types print them. A single-quoted string hovers double-quoted with its escapes read, so `'It\'s'` shows `"It's"`, and a single-quoted key is named the same way. A number hovers as its value, so `10` shows `10` and `2.50` shows `2.5`, where it used to show as a field named after its first digits.
- e80b308: A query parameter now hovers as the type the content mapper generates for it in `QueryParams`. The hover reads the query's syntax tree the way the content mapper does, instead of reading the text around each `$param`. A parameter inside a query whose root is an object, such as `$type` in `{"slugs": *[_type == $type]{…}}{…}.slugs`, now gets its type instead of `unknown`. The bounds of `x in $min..$max`, an arithmetic operand such as `$bump` in `views + $bump > 10`, a parameter compared with a literal (`$flag == true` is a `boolean`), and a parameter compared inside a filter of a function argument are typed as well. A subscript such as `[$i]` hovers as `unknown`, as in the generated types, since it may be an index, an attribute name or a filter.
- 7df08ec: A field read through `^` in a filter over an array of strings or numbers now hovers with its type, as `tags` does in `tags[@ in ^.tags]` or `count(tags[@ in ^.^.tags]) > 0`. Before, such a hover showed only the field name, because the scope it was read in only had a type for object elements.
- 9ec0af1: Hover types now print the way `sanity typegen` and the content mapper generate them. An empty union, such as a Portable Text `listItem` with no list styles, shows as `never` instead of `null`. Number and boolean literals show their value (`3`, `false`). An attribute whose name is not an identifier is quoted (`"my title": string`). The items of an array of named types, such as an array of references, have the `_key: string` that `ArrayOf<…>` adds, and an array of named and other types is shown as one array of each. A type the schema does not have, and an object whose other attributes are unknown, show as `unknown`.
- c0dcd49: Field, projection key and custom function call hovers now read the query's syntax tree, in the scopes groq-js evaluates it in, so they show the type the generated `QueryResponse` gives that part of the query. Before, the hover rebuilt the scopes from the text around the cursor. That failed on queries whose root is an object, as in `{"slugs": *[…]{…}}{…}.slugs`, where hovers fell back to the type of the whole query. It also failed after a `//` comment with an apostrophe in it. A field in a `select()` alternative or in a conditional `condition => {…}` attribute is now read only for the document types its condition keeps, as groq-js reads it. A field the schema does not have hovers as `null`, as in the generated types, instead of as the whole query. `true`, `false` and `null` hover as literals, and `in`, `match`, `asc` and `desc` show no hover.
- Updated dependencies [a202095]
- Updated dependencies [644a1ac]
  - @sanity-labs/lint-core@1.0.3
  - @sanity-labs/groq-lint@1.3.1
  - @sanity-labs/groq-wasm@1.2.4

## 1.4.0

### Minor Changes

- 6528354: Hovering a field inside a filter `[]` now shows the type it can have before the filter is applied, instead of the type the filter narrows it to. `_type` in `*[_type == "post"]` hovers as every document type in the schema, while `_type` in the projection `*[_type == "post"]{_type}` is narrowed to `"post"` (and to `"post" | "author"` for `_type in ["post", "author"]`). `invalid-type-filter` now also checks the names in `_type in [...]` comparisons.

  Thanks to Cody Olsen for the report.

### Patch Changes

- c18216a: Schema-aware hover now resolves fields inside a `...@-> { … }` spread, and any other `->` projection, against the dereferenced document type: in `showcaseProjects[] { _key, ...@-> { _id, _type, title } }`, `_type` hovers as `project` and `title` as the project's `title`, instead of falling back to the type of the whole query. A field followed by a projection, such as `showcaseProjects[] { … }` or `author-> { … }`, hovers as what the projection makes of it (`Array<{ _key: string; _id: string; _type: "project"; … }> | null`), which is what the query returns under that key. Objects whose `rest` is a named type, as `sanity schema extract` writes array items that are references, now show and resolve the attributes of that type (`_ref`, `_type: "reference"`, `_weak?`) instead of only their own.

  Thanks to Cody Olsen for reporting the wrong hovers and the query that reproduced them.

- 56eea6f: Hovering a query parameter such as `$slug` now shows the type the query uses it as, instead of the type of the whole query. The type is inferred from how the parameter is used: compared (`==`, `!=`, `<`, `>`, `<=`, `>=`) or tested with `in` against a field the schema types, matched with `match` (a string), or used as an index or slice bound (a number). `null` is left out of the type of the field it is compared to, and a parameter nothing types hovers as `unknown`.

  Thanks to Cody Olsen for the report.

- c61deb8: Fix hovering a string literal showing the type of the whole query. A string such as `"settings"` in `_type == "settings"` now hovers as the literal itself, and a quoted projection or object key such as `"overview"` in `"overview": pt::text(overview)` hovers as the type of its value (`overview: string`).

  Thanks to Cody Olsen for the report.

- Updated dependencies [6528354]
  - @sanity-labs/groq-lint@1.3.0

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
