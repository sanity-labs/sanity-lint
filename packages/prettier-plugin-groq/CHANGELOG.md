# @sanity/prettier-plugin-groq

## 1.0.17

### Patch Changes

- Updated dependencies [6413dec]
- Updated dependencies [81c7a36]
  - @sanity-labs/groq-wasm@1.3.0

## 1.0.16

### Patch Changes

- Updated dependencies [f5e6548]
  - @sanity-labs/groq-wasm@1.2.7

## 1.0.15

### Patch Changes

- Updated dependencies [286428f]
  - @sanity-labs/groq-wasm@1.2.6

## 1.0.14

### Patch Changes

- Updated dependencies [ad96464]
  - @sanity-labs/groq-wasm@1.2.5

## 1.0.13

### Patch Changes

- Updated dependencies [df10e1a]
  - @sanity-labs/groq-wasm@1.2.4

## 1.0.12

### Patch Changes

- f2a88ac: Build with tsdown instead of tsup. Entry points, exports, `.d.ts` files and the `wasm` folder are unchanged; internal chunk file names differ, and built-in imports keep their `node:` prefix.
- Updated dependencies [f2a88ac]
- Updated dependencies [3ea987f]
  - @sanity-labs/groq-wasm@1.2.3

## 1.0.11

### Patch Changes

- Updated dependencies [4d12bab]
  - @sanity-labs/groq-wasm@1.2.2

## 1.0.10

### Patch Changes

- 61fad7c: Fix the embed plugin leaving `$__exprN__` placeholders in the output when a `groq` or `defineQuery` template literal contains `${...}` interpolations. Interpolations are now restored exactly, and the template is left untouched if they cannot be.

## 1.0.9

### Patch Changes

- Updated dependencies [fe24ad9]
- Updated dependencies [52296ca]
  - @sanity-labs/groq-wasm@1.2.1

## 1.0.8

### Patch Changes

- Updated dependencies [3a5ccda]
- Updated dependencies [51f9241]
  - @sanity-labs/groq-wasm@1.2.0

## 1.0.7

### Patch Changes

- Updated dependencies [2f46aef]
  - @sanity-labs/groq-wasm@1.1.1

## 1.0.6

### Patch Changes

- Updated dependencies [9a4a5fc]
- Updated dependencies [16500f8]
- Updated dependencies [e0b0c41]
- Updated dependencies [8eb11c7]
- Updated dependencies [c6eb248]
  - @sanity-labs/groq-wasm@1.1.0

## 1.0.5

### Patch Changes

- Updated dependencies [5d1411a]
  - @sanity-labs/groq-wasm@1.0.3

## 1.0.4

### Patch Changes

- Updated dependencies [8a41ec8]
  - @sanity-labs/groq-wasm@1.0.2

## 1.0.3

### Patch Changes

- Updated dependencies [f1062e2]
  - @sanity-labs/groq-wasm@1.0.1

## 1.0.2

### Patch Changes

- 7fbee03: Add `bugs` and `homepage` metadata to package.json so npm links to the issue tracker and README.

## 1.0.1

### Patch Changes

- 042b456: Append a trailing newline to formatted GROQ output.

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

## 0.2.0

### Minor Changes

- c872504: Upgrade groq-wasm to latest version

### Patch Changes

- Updated dependencies [c872504]
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
  - @sanity-labs/groq-wasm@0.1.0

## 0.0.2

### Patch Changes

- [#11](https://github.com/sanity-io/sanity-lint/pull/11) [`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66) Thanks [@kmelve](https://github.com/kmelve)! - Add CommonJS exports to all library packages

  All library packages now export both ESM and CJS formats, fixing compatibility
  issues with ESLint configurations that use `require()` or FlatCompat.
  - @sanity/lint-core: ESM + CJS
  - @sanity/groq-lint: ESM + CJS (library), ESM only (CLI)
  - @sanity/schema-lint: ESM + CJS
  - @sanity/prettier-plugin-groq: ESM + CJS

- Updated dependencies []:
  - @sanity/groq-wasm@0.0.1
