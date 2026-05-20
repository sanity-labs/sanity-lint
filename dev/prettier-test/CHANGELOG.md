# prettier-test

## 1.0.0

### Major Changes

- 0742230: BREAKING CHANGE: Minimum Node.js version is now v22.3.0.

  BREAKING CHANGE: Explicit CommonJS builds have been dropped. All supported Node.js versions provide transparent CommonJS/ESM interop, so consumers can `require()` the published ESM directly.

  BREAKING CHANGE: WASM initialization is now handled automatically at import time, so the explicit init/availability APIs have been removed:
  - `@sanity-labs/groq-wasm`: removed `initWasm`, `isInitialized`, `lintAsync`, and `formatAsync`. Use `lint` and `format` directly.
  - `@sanity-labs/groq-lint`: removed `initLinter` and `isWasmAvailable`.
  - `@sanity-labs/prettier-plugin-groq`: removed `initWasmFormatter`, `isWasmFormatterAvailable`, and `createGroqPrinter`. The plugin can be used immediately after import with no async bootstrap.
