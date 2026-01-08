# @sanity/eslint-plugin

Catch bugs in your GROQ queries and schema definitions before they hit production.

Works with both **ESLint** and **OxLint**.

## What It Catches

**GROQ queries:**

```typescript
// ❌ Performance issue - joins in filters cause full scans
const query = groq`*[_type == "post" && author->name == "John"]`
// ⚠️ sanity/groq-join-in-filter

// ❌ Typo that silently returns nothing (with schema-aware linting)
const query = groq`*[_type == "psot"]`
// ⚠️ sanity/groq-invalid-type-filter: Type "psot" not found in schema
```

**Schema definitions:**

```typescript
// ❌ Missing defineType wrapper
export const post = {
  name: 'post',
  type: 'document',
  fields: [...]
}
// ⚠️ sanity/schema-missing-define-type

// ❌ Reserved field name that would break at runtime
defineField({ name: '_type', type: 'string' })
// ⚠️ sanity/schema-reserved-field-name
```

## Installation

```bash
npm install @sanity/eslint-plugin
```

## Usage with ESLint

```javascript
// eslint.config.js
import sanity from '@sanity/eslint-plugin'

export default [
  ...sanity.configs.recommended,
  // or for stricter checking:
  // ...sanity.configs.strict,
]
```

## Usage with OxLint

OxLint supports ESLint-compatible JS plugins. Our plugin works out of the box:

```json
// oxlint.config.json
{
  "jsPlugins": ["@sanity/eslint-plugin"],
  "rules": {
    "sanity/groq-join-in-filter": "error",
    "sanity/groq-deep-pagination": "warn"
  }
}
```

Then run:

```bash
oxlint --config oxlint.config.json src/
```

> **Note**: OxLint JS plugins are experimental. See [OxLint JS Plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins) for details.

## Configurations

### `recommended`

Balanced defaults - errors for serious issues, warnings for improvements. Includes both GROQ and schema rules.

```javascript
export default [...sanity.configs.recommended]
```

### `strict`

All rules enabled as errors.

### `groq`

GROQ rules only - use in frontends, functions, or anywhere you write GROQ queries but don't have schema definitions.

```javascript
export default [...sanity.configs.groq]
```

### `schema`

Schema rules only - use in schema packages within monorepos where you only want to lint schema definitions.

```javascript
export default [...sanity.configs.schema]
```

### `performance`

Performance-focused GROQ rules only - for teams who want to catch expensive queries but don't care about style/best practices.

```javascript
export default [...sanity.configs.performance]
```

## Rules

### GROQ Rules

These rules lint GROQ queries in:

- `groq\`...\`` tagged template literals
- `defineQuery('...')` function calls (from `next-sanity` or `@sanity/client`)

| Rule                                       | Default | Description                                     |
| ------------------------------------------ | ------- | ----------------------------------------------- |
| `sanity/groq-join-in-filter`               | error   | Avoid `->` inside filters                       |
| `sanity/groq-join-to-get-id`               | warn    | Use `._ref` instead of `->_id`                  |
| `sanity/groq-deep-pagination`              | warn    | Avoid large offsets (>=1000)                    |
| `sanity/groq-large-pages`                  | warn    | Avoid fetching >100 results                     |
| `sanity/groq-many-joins`                   | warn    | Avoid >10 joins in one query                    |
| `sanity/groq-computed-value-in-filter`     | error   | Avoid computed values in filters                |
| `sanity/groq-non-literal-comparison`       | error   | Avoid comparing two non-literals                |
| `sanity/groq-order-on-expr`                | error   | Avoid ordering on computed values               |
| `sanity/groq-repeated-dereference`         | info    | Avoid repeated `->` on same attribute           |
| `sanity/groq-match-on-id`                  | info    | Avoid match on `_id` with wildcard              |
| `sanity/groq-count-in-correlated-subquery` | info    | Avoid `count()` on correlated subqueries        |
| `sanity/groq-very-large-query`             | error   | Query exceeds 10KB                              |
| `sanity/groq-extremely-large-query`        | error   | Query exceeds 100KB                             |
| `sanity/groq-unknown-field`                | error   | Field doesn't exist in schema (requires schema) |
| `sanity/groq-invalid-type-filter`          | error   | Type doesn't exist in schema (requires schema)  |

### Schema Rules

These rules lint Sanity schema definitions using `defineType()` and `defineField()`.

| Rule                                        | Default | Description                                 |
| ------------------------------------------- | ------- | ------------------------------------------- |
| `sanity/schema-missing-define-type`         | error   | Must use `defineType()`                     |
| `sanity/schema-missing-define-field`        | error   | Fields should use `defineField()`           |
| `sanity/schema-reserved-field-name`         | error   | Avoid reserved field names (`_id`, `_type`) |
| `sanity/schema-missing-icon`                | warn    | Document types should have icons            |
| `sanity/schema-missing-title`               | warn    | Types should have titles                    |
| `sanity/schema-missing-slug-source`         | warn    | Slug fields need `options.source`           |
| `sanity/schema-heading-level-in-schema`     | warn    | Don't store heading levels                  |
| `sanity/schema-missing-description`         | off     | Fields should have descriptions             |
| `sanity/schema-boolean-instead-of-list`     | off     | Consider options.list over boolean          |
| `sanity/schema-array-missing-constraints`   | off     | Arrays should have constraints              |
| `sanity/schema-unnecessary-reference`       | off     | Consider embedding instead                  |
| `sanity/schema-presentation-field-name`     | off     | Avoid presentation-focused names            |
| `sanity/schema-missing-required-validation` | off     | Critical fields need validation             |

## Schema-Aware Linting

For schema-aware rules (`unknown-field`, `invalid-type-filter`), you need to provide a schema:

```javascript
// eslint.config.js
import sanity from '@sanity/eslint-plugin'

export default [
  ...sanity.configs.recommended,
  {
    settings: {
      sanity: {
        schemaPath: './schema.json',
      },
    },
  },
]
```

Generate `schema.json` with:

```bash
npx sanity schema extract
```

## Monorepo Setup

When using @sanity/eslint-plugin in a monorepo (turborepo, pnpm workspaces, etc.), VS Code/Cursor may have trouble finding the ESLint config for nested packages.

### VS Code / Cursor Settings

Create `.vscode/settings.json` at your **monorepo root**:

```json
{
  "eslint.workingDirectories": [
    { "directory": "apps/web", "changeProcessCWD": true },
    { "directory": "apps/studio", "changeProcessCWD": true }
  ]
}
```

Replace the paths with your actual package directories that have ESLint configs.

### Alternative: Auto-detect

You can also let ESLint auto-detect working directories:

```json
{
  "eslint.workingDirectories": [{ "mode": "auto" }]
}
```

### Troubleshooting

If rules still don't appear in the editor:

1. **Restart ESLint Server**: `Cmd+Shift+P` → "ESLint: Restart ESLint Server"
2. **Check ESLint Output**: View → Output → select "ESLint" to see errors
3. **Verify flat config**: Ensure `eslint.config.mjs` exists in your package directory

> **Note**: The CLI (`npx eslint .`) works regardless of these settings. This is purely for editor integration.

## License

MIT
