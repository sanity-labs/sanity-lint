# @sanity-labs/groq-wasm

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
