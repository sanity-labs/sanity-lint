# @sanity/groq-lsp

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
