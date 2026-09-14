# groq-lint-playground

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

## 0.0.5

### Patch Changes

- Updated dependencies [c872504]
  - @sanity-labs/groq-lint@0.2.0
  - @sanity-labs/prettier-plugin-groq@0.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [06a5052]
  - @sanity-labs/groq-lint@0.1.0
  - @sanity-labs/prettier-plugin-groq@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @sanity/groq-lint@0.0.3
  - @sanity/prettier-plugin-groq@0.0.2

## 0.0.2

### Patch Changes

- Updated dependencies [[`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66)]:
  - @sanity/groq-lint@0.0.2
  - @sanity/prettier-plugin-groq@0.0.2
