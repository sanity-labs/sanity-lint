# @sanity/groq-lsp

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
