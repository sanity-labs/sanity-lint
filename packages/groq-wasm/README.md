# @sanity-labs/groq-wasm

WASM bindings for GROQ linting and formatting.

This package provides TypeScript wrappers around:

- **[groq-lint](https://github.com/atombender/groq-lint)** (Rust) - GROQ query linting
- **[groq-format](https://github.com/atombender/groq-format)** (Rust) - GROQ query formatting

Both are compiled to WebAssembly for use in Node.js and browsers without requiring the Rust toolchain.

## Installation

```bash
npm install @sanity-labs/groq-wasm
```

## Usage

```typescript
import { initWasm, lint, format } from '@sanity-labs/groq-wasm'

// Initialize WASM (call once at startup)
await initWasm()

// Lint a query
const findings = lint('*[_type == "post"]{ author-> }')
console.log(findings)
// [{ ruleId: 'join-in-filter', message: '...', severity: 'error' }]

// Format a query
const formatted = format('*[_type=="post"]{title,body}')
console.log(formatted)
// '*[_type == "post"]{ title, body }'
```

## API

### Initialization

#### `initWasm(): Promise<void>`

Initialize the WASM modules. Must be called before using `lint()` or `format()`.
Safe to call multiple times.

#### `isInitialized(): boolean`

Check if WASM modules are initialized.

### Linting

#### `lint(query: string, config?: WasmLintConfig): Finding[]`

Lint a GROQ query and return findings.

```typescript
interface WasmLintConfig {
  rules?: Record<string, boolean> // Enable/disable specific rules
}
```

#### `lintAsync(query: string, config?: WasmLintConfig): Promise<Finding[]>`

Async version of `lint()`.

### Formatting

#### `format(query: string, config?: WasmFormatConfig): string`

Format a GROQ query.

```typescript
interface WasmFormatConfig {
  width?: number // Max line width (default: 80)
}
```

#### `formatAsync(query: string, config?: WasmFormatConfig): Promise<string>`

Async version of `format()`.

#### `isValidSyntax(query: string): boolean`

Check if a query has valid GROQ syntax.

### Constants

#### `DEFAULT_WIDTH: number`

Default line width for formatting (80).

#### `RULE_ID_MAP: Record<string, string>`

Mapping from Rust rule IDs (snake_case) to TS convention (kebab-case).

## Lint Rules

The following rules are available (from Rust groq-lint):

| Rule ID                        | Severity | Description                                          |
| ------------------------------ | -------- | ---------------------------------------------------- |
| `join-in-filter`               | error    | Dereference (->) inside filter prevents optimization |
| `join-to-get-id`               | warning  | Using -> to get \_id (use .\_ref instead)            |
| `computed-value-in-filter`     | error    | Computed values in filter prevent optimization       |
| `match-on-id`                  | info     | Using match on \_id with wildcard                    |
| `order-on-expr`                | error    | Ordering on computed values                          |
| `deep-pagination`              | warning  | Large offset in slice (>=1000)                       |
| `large-pages`                  | warning  | Fetching >100 results from index 0                   |
| `non-literal-comparison`       | error    | Comparing two non-literal expressions                |
| `repeated-dereference`         | info     | Multiple -> on same attribute in projection          |
| `count-in-correlated-subquery` | info     | count() on correlated subqueries                     |
| `very-large-query`             | error    | Query exceeds 10KB                                   |
| `extremely-large-query`        | error    | Query exceeds 100KB                                  |
| `many-joins`                   | warning  | Query has >10 dereference operators                  |

## Error Handling

```typescript
import { WasmError } from '@sanity-labs/groq-wasm'

try {
  const findings = lint(query)
} catch (error) {
  if (error instanceof WasmError) {
    switch (error.code) {
      case 'NOT_INITIALIZED':
        // Call initWasm() first
        break
      case 'PARSE_ERROR':
        // Invalid GROQ syntax
        break
      case 'WASM_ERROR':
        // Other WASM error
        break
    }
  }
}
```

## Browser Support

This package works in modern browsers that support WebAssembly. The WASM modules are loaded automatically based on the environment.

```typescript
// In browser
import { initWasm, lint } from '@sanity-labs/groq-wasm'

await initWasm()
const findings = lint(query)
```

## Architecture

This package uses a **wrapper crate** approach:

```
packages/groq-wasm/
├── rust/                    # Rust wrapper crate
│   ├── Cargo.toml          # Depends on groq-lint & groq-format
│   └── src/lib.rs          # wasm-bindgen exports
├── wasm/                    # Built WASM output (generated)
├── src/                     # TypeScript wrappers
│   ├── index.ts            # Main exports
│   ├── lint.ts             # Linting API
│   ├── format.ts           # Formatting API
│   └── wasm-loader.ts      # WASM initialization
└── scripts/
    └── build-wasm.sh       # Build script
```

The Rust crate depends on upstream repos as git dependencies (no forking required).

## Building from Source

To rebuild the WASM bindings:

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack
```

### Build

```bash
cd packages/groq-wasm
./scripts/build-wasm.sh
```

This will:

1. Compile the Rust wrapper crate to WASM
2. Generate JS bindings via wasm-bindgen
3. Output files to `wasm/`

## Performance

The WASM implementation provides significant performance benefits:

- **Linting**: ~5-10x faster than TypeScript for complex queries
- **Formatting**: Near-instant formatting for most queries
- **Memory**: Lower memory footprint than JavaScript AST processing

## License

MIT
