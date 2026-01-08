# eslint-plugin-sanity

Catch GROQ bugs before they hit production.

This ESLint plugin validates your GROQ queries and Sanity schemas in your editor. **With schema-aware linting enabled**, it catches typos in field names, invalid type filters, and queries that would silently return empty results. It also flags performance patterns that slow down your app at scale.

Works with **ESLint**, **OxLint**, and other ESLint-compatible tools.

## Installation

```bash
npm install eslint-plugin-sanity
```

## Quick Start

**Use `recommended` unless you have a reason not to.** It flags serious issues as errors and suggestions as warnings—a good balance for most teams.

```javascript
// eslint.config.js
import sanity from 'eslint-plugin-sanity'

export default [
  ...sanity.configs.recommended, // ← start here
]
```

The `strict` config treats all rules as errors. Use it if you want zero tolerance for lint warnings (e.g., in CI).

## See It Working

After setup, try this in any `.ts` or `.js` file:

```typescript
import { groq } from 'next-sanity'

// This query has a performance issue - joins inside filters are expensive:
const query = groq`*[_type == "post" && author->name == "John"]`
```

You should see:

```
error  Avoid joins (`->`) inside filters. They cause a full scan.
       Consider fetching the author separately or restructuring the query.  sanity/groq-join-in-filter
```

If you see this error, it's working. If not, check the [Troubleshooting](#troubleshooting) section.

## When GROQ Linting Matters (and When It Doesn't)

**GROQ rules cover two areas:**

- **Correctness** (schema-aware): Catches typos, invalid fields, and type mismatches that cause silent failures. _Requires [schema setup](#schema-aware-linting)._
- **Performance**: Catches expensive patterns like joins in filters and deep pagination. _Works out of the box._

**Performance rules matter most when:**

- Queries run on every page load (not cached)
- You're querying large datasets
- Response time affects user experience

**They matter less when:**

- Results are cached (CDN, ISR, static generation)
- You're running one-off queries (migrations, audits)
- Dataset is small and performance isn't a concern

### Common Overrides

Some rules may not fit every project. Here are the ones teams commonly adjust:

| Rule                         | Why you might disable it                           |
| ---------------------------- | -------------------------------------------------- |
| `groq-join-in-filter`        | Results are cached or dataset is small             |
| `groq-deep-pagination`       | You need offset-based pagination for a specific UI |
| `schema-missing-icon`        | You don't need icons for all document types        |
| `schema-missing-description` | You don't require descriptions on all fields       |

```javascript
// eslint.config.js
export default [
  ...sanity.configs.recommended,
  {
    rules: {
      'sanity/groq-join-in-filter': 'off',
      'sanity/schema-missing-description': 'warn',
    },
  },
]
```

## Configurations

### `recommended`

Balanced defaults - errors for serious issues, warnings for improvements.

### `strict`

All rules enabled as errors.

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
| `sanity/schema-missing-define-field`        | warn    | Fields should use `defineField()`           |
| `sanity/schema-missing-icon`                | warn    | Document types should have icons            |
| `sanity/schema-missing-title`               | warn    | Types should have titles                    |
| `sanity/schema-missing-description`         | info    | Fields should have descriptions             |
| `sanity/schema-missing-slug-source`         | warn    | Slug fields need `options.source`           |
| `sanity/schema-reserved-field-name`         | error   | Avoid reserved field names (`_id`, `_type`) |
| `sanity/schema-array-missing-constraints`   | warn    | Arrays should have constraints              |
| `sanity/schema-boolean-instead-of-list`     | info    | Consider options.list over boolean          |
| `sanity/schema-heading-level-in-schema`     | warn    | Don't store heading levels                  |
| `sanity/schema-unnecessary-reference`       | info    | Consider embedding instead                  |
| `sanity/schema-presentation-field-name`     | warn    | Avoid presentation-focused names            |
| `sanity/schema-missing-required-validation` | warn    | Critical fields need validation             |

## Schema-Aware Linting

For schema-aware rules (`unknown-field`, `invalid-type-filter`), you need to provide a schema:

```javascript
// eslint.config.js
import sanity from 'eslint-plugin-sanity'

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

When using eslint-plugin-sanity in a monorepo (Turborepo, pnpm workspaces, etc.), the recommended approach is a **root-level ESLint config** that applies to all packages.

### Basic Setup (Any Project)

For monorepos without Next.js, create `eslint.config.mjs` at the **root**:

```javascript
// eslint.config.mjs
import sanity from 'eslint-plugin-sanity'

export default [
  // Global ignores
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/sanity.types.ts'],
  },

  // Sanity GROQ and schema linting for all packages
  ...sanity.configs.recommended,
]
```

**Required dependencies:**

```bash
pnpm add -D -w eslint eslint-plugin-sanity
```

That's it! This works for any JavaScript/TypeScript monorepo.

### Next.js + Sanity Monorepo

If you're using Next.js and want to combine its ESLint rules with Sanity linting:

```javascript
// eslint.config.mjs
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import sanity from 'eslint-plugin-sanity'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default [
  // Global ignores
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/sanity.types.ts'],
  },

  // Sanity GROQ and schema linting for all packages
  ...sanity.configs.recommended,

  // Next.js rules (scoped to web app)
  ...compat.extends('next/core-web-vitals').map((config) => ({
    ...config,
    files: ['apps/web/**/*.{js,jsx,ts,tsx}'],
    settings: {
      ...config.settings,
      next: { rootDir: 'apps/web' },
      react: { version: 'detect' },
    },
  })),
]
```

**Additional dependencies for Next.js:**

```bash
# Core deps
pnpm add -D -w eslint eslint-plugin-sanity

# Next.js ESLint integration (FlatCompat + peer deps)
pnpm add -D -w @eslint/eslintrc eslint-config-next \
  eslint-plugin-react eslint-plugin-react-hooks \
  eslint-plugin-jsx-a11y eslint-plugin-import @next/eslint-plugin-next
```

> **Note:** The extra deps (`eslint-config-next`, `eslint-plugin-react`, etc.) are peer dependencies of `eslint-config-next` that pnpm doesn't auto-install at root level. Pin `@next/eslint-plugin-next` to the same version as `eslint-config-next` to avoid compatibility issues.

### VS Code / Cursor Settings

Create `.vscode/settings.json` at your **monorepo root**:

```json
{
  "eslint.useFlatConfig": true
}
```

### Alternative: Per-Package Configs

If you prefer separate configs per package, use `eslint.workingDirectories`:

```json
{
  "eslint.workingDirectories": [
    { "directory": "apps/web", "changeProcessCWD": true },
    { "directory": "apps/studio", "changeProcessCWD": true }
  ]
}
```

Or auto-detect:

```json
{
  "eslint.workingDirectories": [{ "mode": "auto" }]
}
```

### Troubleshooting

**ESLint extension not showing errors:**

1. **Check ESLint Output**: `Cmd+Shift+P` → "ESLint: Show Output Channel" - look for config loading errors
2. **Restart ESLint Server**: `Cmd+Shift+P` → "ESLint: Restart ESLint Server"
3. **Verify extension is enabled**: Check that the ESLint extension is enabled for your workspace
4. **Missing dependencies**: Ensure all peer dependencies are installed at root level

**Common errors:**

- `Failed to load config "next/core-web-vitals"` - Install `eslint-config-next` at root
- `Cannot find module 'eslint-plugin-react-hooks'` - Install Next.js ESLint peer deps at root
- `Unexpected top-level property "name"` - Version mismatch between `eslint-config-next` and `@next/eslint-plugin-next`

> **Note**: The CLI (`npx eslint .`) may work even when the extension doesn't. Check the ESLint Output panel for config loading errors.

## ESLint, Prettier, and Modern Alternatives

### ESLint vs Prettier

**ESLint** and **Prettier** serve different purposes and work great together:

| Tool         | Purpose                       | Examples                                          |
| ------------ | ----------------------------- | ------------------------------------------------- |
| **ESLint**   | Catches bugs and bad patterns | Unused variables, unsafe queries, missing `await` |
| **Prettier** | Formats code consistently     | Indentation, line length, quote style             |

`eslint-plugin-sanity` is an ESLint plugin - it catches GROQ query issues and schema problems. Use it alongside Prettier for formatting.

**Recommended setup:**

```json
// package.json
{
  "scripts": {
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write ."
  }
}
```

### OxLint (Faster Alternative)

[OxLint](https://oxc.rs) is a Rust-based linter that's ~50-100x faster than ESLint. It supports ESLint plugins via JS plugin compatibility:

```json
// oxlint.config.json
{
  "jsPlugins": ["eslint-plugin-sanity"],
  "rules": {
    "sanity/groq-join-in-filter": "error",
    "sanity/groq-deep-pagination": "warn"
  }
}
```

```bash
oxlint --config oxlint.config.json src/
```

**When to use OxLint:**

- Large codebases where ESLint is slow
- CI/CD pipelines where speed matters
- Projects that don't need the full ESLint ecosystem

> **Note**: OxLint JS plugins are experimental. Not all ESLint features are supported.

### Biome (All-in-One)

[Biome](https://biomejs.dev) combines linting and formatting in one fast Rust tool. However, **Biome doesn't support ESLint plugins** - it has its own rule set.

For Sanity projects, we recommend ESLint (or OxLint) + Prettier over Biome, since you get access to `eslint-plugin-sanity` rules.

## License

MIT
