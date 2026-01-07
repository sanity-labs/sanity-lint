# eslint-plugin-sanity

## 0.0.3

### Patch Changes

- Updated dependencies [[`00b9e79`](https://github.com/sanity-io/sanity-lint/commit/00b9e79abc81e7f540a24aaa1892322718155d66)]:
  - @sanity/groq-lint@0.0.2
  - @sanity/lint-core@0.0.2
  - @sanity/schema-lint@0.0.2

## 0.0.2

### Patch Changes

- [#9](https://github.com/sanity-io/sanity-lint/pull/9) [`2349991`](https://github.com/sanity-io/sanity-lint/commit/2349991a8dd02029784bfcaba6c81aa67bf609e9) Thanks [@kmelve](https://github.com/kmelve)! - Add CommonJS export for ESLint compatibility

  The plugin now exports both ESM and CJS formats, fixing compatibility issues
  with ESLint configurations that use `require()` or FlatCompat.
