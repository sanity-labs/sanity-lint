# @sanity/lint-core

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

## 0.0.3

### Patch Changes

- [#15](https://github.com/sanity-io/sanity-lint/pull/15) [`10068a2`](https://github.com/sanity-io/sanity-lint/commit/10068a2ab9b0f3fdc4a60e4f933b12f595e10115) Thanks [@kmelve](https://github.com/kmelve)! - Widen vitest peer dependency to >=2.0.0

  The `/testing` export only uses basic vitest APIs (`describe`, `it`, `expect`) that are
  stable across vitest 2.x, 3.x, and 4.x. This allows projects using newer vitest versions
  to use `@sanity/lint-core/testing` without peer dependency warnings.

## 0.0.2

### Patch Changes

- [#11](https://github.com/sanity-io/sanity-lint/pull/11) [`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66) Thanks [@kmelve](https://github.com/kmelve)! - Add CommonJS exports to all library packages

  All library packages now export both ESM and CJS formats, fixing compatibility
  issues with ESLint configurations that use `require()` or FlatCompat.
  - @sanity/lint-core: ESM + CJS
  - @sanity/groq-lint: ESM + CJS (library), ESM only (CLI)
  - @sanity/schema-lint: ESM + CJS
  - @sanity/prettier-plugin-groq: ESM + CJS
