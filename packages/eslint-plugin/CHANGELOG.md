# eslint-plugin-sanity

## 0.1.2

### Patch Changes

- [#17](https://github.com/sanity-io/sanity-lint/pull/17) [`1202aea`](https://github.com/sanity-io/sanity-lint/commit/1202aea418a5ba352c935ba945ddfeccea8f4cd3) Thanks [@kmelve](https://github.com/kmelve)! - Export configs as arrays for easier spreading

  `sanity.configs.recommended` and `sanity.configs.strict` are now arrays,
  allowing users to use either syntax:

  ```js
  // Both of these now work:
  export default [...sanity.configs.recommended]
  export default [sanity.configs.recommended]  // ESLint flattens nested arrays
  ```

  This follows the convention used by other ESLint plugins and prevents the
  "is not iterable" error when users spread the config.

## 0.1.1

### Patch Changes

- Updated dependencies [[`10068a2`](https://github.com/sanity-io/sanity-lint/commit/10068a2ab9b0f3fdc4a60e4f933b12f595e10115)]:
  - @sanity/lint-core@0.0.3
  - @sanity/groq-lint@0.0.3
  - @sanity/schema-lint@0.0.3

## 0.1.0

### Minor Changes

- [#13](https://github.com/sanity-io/sanity-lint/pull/13) [`7b96e0c`](https://github.com/sanity-io/sanity-lint/commit/7b96e0cdfdfd54fabcb94ff46a56fb17e92a7f62) Thanks [@kmelve](https://github.com/kmelve)! - Add support for `defineQuery()` function calls

  The ESLint plugin now detects and lints GROQ queries in `defineQuery()` calls,
  which is used by `next-sanity` and other Sanity packages.

  Supported patterns:
  - `defineQuery(\`\*[_type == "post"]\`)` - template literal argument
  - `defineQuery("*[_type == 'post']")` - string literal argument
  - `groq(\`...\`)` - groq function call (in addition to tagged templates)

  This is in addition to the existing `groq\`...\`` tagged template support.

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
