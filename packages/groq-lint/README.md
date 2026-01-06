# @sanity/groq-lint

GROQ query linter for catching performance issues and best practice violations.

## Installation

```bash
npm install @sanity/groq-lint
# or
pnpm add @sanity/groq-lint
```

## Usage

### CLI

```bash
# Lint a query directly
npx @sanity/groq-lint -q '*[author->name == "Bob"]'

# Lint files
npx @sanity/groq-lint 'src/**/*.ts'

# With schema for schema-aware rules
npx @sanity/groq-lint 'src/**/*.ts' --schema schema.json

# JSON output for CI
npx @sanity/groq-lint --json 'src/**/*.ts'
```

### Programmatic API

```typescript
import { lint, initLinter } from '@sanity/groq-lint'

// Optional: Initialize WASM for better performance
await initLinter()

// Lint a query
const result = lint('*[author->name == "Bob"]')

if (result.findings.length > 0) {
  for (const finding of result.findings) {
    console.log(`${finding.ruleId}: ${finding.message}`)
  }
}
```

### With Configuration

```typescript
import { lint } from '@sanity/groq-lint'

const result = lint(query, {
  config: {
    rules: {
      'deep-pagination': false, // Disable specific rule
      'large-pages': { enabled: true }, // Configure rule
    },
  },
})
```

### With Schema (Schema-Aware Rules)

```typescript
import { lint } from '@sanity/groq-lint'
import type { SchemaType } from 'groq-js'

const schema: SchemaType = {
  // Your Sanity schema
}

const result = lint(query, { schema })
```

## Rules

| Rule                           | Severity | Description                                            |
| ------------------------------ | -------- | ------------------------------------------------------ |
| `join-in-filter`               | error    | Dereference (`->`) inside filter prevents optimization |
| `join-to-get-id`               | warning  | Using `->` to get `_id` (use `._ref` instead)          |
| `computed-value-in-filter`     | error    | Computed values in filter prevent optimization         |
| `match-on-id`                  | info     | Using `match` on `_id` with wildcard                   |
| `order-on-expr`                | error    | Ordering on computed values                            |
| `deep-pagination`              | warning  | Large offset in slice (>=1000)                         |
| `deep-pagination-param`        | warning  | Pagination offset from parameter                       |
| `large-pages`                  | warning  | Fetching >100 results from index 0                     |
| `non-literal-comparison`       | error    | Comparing two non-literal expressions                  |
| `repeated-dereference`         | info     | Multiple `->` on same attribute in projection          |
| `count-in-correlated-subquery` | info     | `count()` on correlated subqueries                     |
| `very-large-query`             | error    | Query exceeds 10KB                                     |
| `extremely-large-query`        | error    | Query exceeds 100KB                                    |
| `many-joins`                   | warning  | Query has >10 dereference operators                    |

## WASM Acceleration

This package uses WASM-compiled Rust for maximum performance on pure GROQ rules. Call `initLinter()` once at startup to enable WASM:

```typescript
import { initLinter, lint } from '@sanity/groq-lint'

// Initialize WASM (optional but recommended)
const wasmAvailable = await initLinter()
console.log(`WASM available: ${wasmAvailable}`)

// lint() automatically uses WASM for supported rules
const result = lint(query)
```

### Hybrid Architecture

The linter uses a hybrid approach:

- **WASM rules**: Pure GROQ rules run via high-performance Rust/WASM
- **TypeScript rules**: Schema-aware rules run via TypeScript

This gives you the best of both worlds: raw performance for syntax-only checks and full schema integration for semantic checks.

### Force TypeScript

To force TypeScript rules (useful for debugging):

```typescript
const result = lint(query, { forceTs: true })
```

## API Reference

### `initLinter(): Promise<boolean>`

Initialize the WASM linter. Returns `true` if WASM is available.

### `lint(query: string, options?: LintOptions): LintResult`

Lint a GROQ query.

```typescript
interface LintOptions {
  config?: LinterConfig // Rule configuration
  schema?: SchemaType // Schema for schema-aware rules
  forceTs?: boolean // Force TypeScript rules
}

interface LintResult {
  query: string
  findings: Finding[]
  parseError?: string
}
```

### `lintMany(queries: string[], options?: LintOptions): LintResult[]`

Lint multiple queries.

## License

MIT
