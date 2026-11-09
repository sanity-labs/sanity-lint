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
import { lint, format, validate } from '@sanity-labs/groq-wasm'

// The default entry loads WASM when the module is imported.
// lint, format, and validate are sync after that import resolves.

// Lint a query
const findings = lint('*[_type == "post"]{ author-> }')
console.log(findings)
// [{ ruleId: 'join-in-filter', message: '...', severity: 'error' }]

// Format a query
const formatted = format('*[_type=="post"]{title,body}')
console.log(formatted)
// '*[_type == "post"]{ title, body }'

// Validate syntax without linting or formatting
const result = validate('*["é" == ]')
if (!result.ok) {
  const { message, start, end } = result.error
  // start/end are UTF-16 indices: query.slice(start, end) === ']'
  console.log(message, start, end)
}
```

## Lazy initialization

The default browser entry fetches the WebAssembly module with a top-level `await`. Bundlers that wrap lazy chunks in non-async factories cannot import it. Sanity Studio's `bundledDev` mode does this and throws `SyntaxError: Unexpected reserved word`.

`@sanity-labs/groq-wasm/lazy` exports the same functions and does not fetch or compile the module when the module is evaluated. Initialize it, then call the API:

```typescript
import { lint, format, validate, load } from '@sanity-labs/groq-wasm/lazy'

await load()

const findings = lint('*[_type == "post"]{ author-> }')
const formatted = format('*[_type=="post"]{title,body}')
```

`load()` fetches the packaged `.wasm` file and initializes it. Concurrent calls share one request, and a later call after success does not fetch again. If `load()` rejects, the module stays uninitialized and the next call retries.

Pass bytes, a `Response`, or a compiled `WebAssembly.Module` to `initWasm()` when you already have the module. Bytes and a `WebAssembly.Module` initialize synchronously. A `Response` returns a promise. `await initWasm(source)` is safe for every accepted source. A second successful call does nothing.

```typescript
import { initWasm, lint } from '@sanity-labs/groq-wasm/lazy'

initWasm(wasmBytes)
// await initWasm(response)
// initWasm(compiledModule)

const findings = lint(query)
```

`lint()`, `format()`, `validate()`, `extractParams()`, and `isValidSyntax()` throw `WasmError` with code `NOT_INITIALIZED` until initialization has succeeded. `lint`, `format`, and `extractParams` still return without touching the module for an empty or whitespace-only query.

The raw module is also exported at `@sanity-labs/groq-wasm/wasm`.

The default `@sanity-labs/groq-wasm` entry is unchanged. Importing it still initializes the module immediately, and it does not export `load` or `initWasm`.

## API

Importing `@sanity-labs/groq-wasm` loads the WASM module. `lint()`, `format()`, and `validate()` are synchronous after that import resolves. To load the module yourself, import `@sanity-labs/groq-wasm/lazy` and call `load()` or `initWasm()`.

### Linting

#### `lint(query: string, config?: WasmLintConfig): Finding[]`

Lint a GROQ query and return findings.

```typescript
interface WasmLintConfig {
  rules?: Record<string, boolean> // Enable/disable specific rules
}
```

### Formatting

#### `format(query: string, config?: WasmFormatConfig): string`

Format a GROQ query.

```typescript
interface WasmFormatConfig {
  width?: number // Max line width (default: 80)
}
```

#### `isValidSyntax(query: string): boolean`

Check if a query has valid GROQ syntax by attempting to format it. An empty query is treated as valid. For a structured parse error, use `validate()`.

### Validation

#### `validate(query: string): ValidateResult`

Parse a GROQ query with groq-parser and return a result value. Syntax errors are not thrown.

```typescript
type ValidateResult = { ok: true } | { ok: false; error: ValidateError }

interface ValidateError {
  message: string
  /** Inclusive 0-based index into the JavaScript string (UTF-16 code units). */
  start: number
  /** Exclusive 0-based index into the JavaScript string (UTF-16 code units). */
  end: number
  /** 1-based line of `start`. */
  line: number
  /** 1-based column of `start`, counted in UTF-16 code units. */
  column: number
  /** 1-based line of `end`. */
  endLine: number
  /** 1-based column of `end`, counted in UTF-16 code units. */
  endColumn: number
}
```

groq-parser reports UTF-8 byte offsets (`ParseError` positions). `validate` converts `start` and `end` to UTF-16 code unit indices so they match JavaScript string indexing (`query.slice(start, end)`) and editors such as Sanity Vision. Lines and columns are 1-based, and columns count UTF-16 code units, the same convention as `line` / `column` on lint finding locations.

`start === end` means the parser reported a caret on a boundary rather than a token span. An empty or whitespace-only query fails with message `"no query"` at offset 0. That differs from `lint('')` (no findings), `format('')` (returns the input), and `isValidSyntax('')` (returns `true`).

`$parameter` references are syntactically valid. `validate` does not check that parameters were declared.

`lint` and `format` are unchanged: invalid syntax still throws `WasmError` with code `PARSE_ERROR`.

### Constants

#### `DEFAULT_WIDTH: number`

Default line width for formatting (80).

#### `RULE_ID_MAP: Record<string, string>`

Mapping from Rust rule IDs (snake_case) to TS convention (kebab-case).

### Parameters

#### `extractParams(query: string): QueryParam[]`

List the `$parameters` a query references, using groq-parser. Returns one entry per distinct name (without the `$`) in order of first reference, each with every reference's span.

```typescript
import { extractParams } from '@sanity-labs/groq-wasm'

const query = '*[_type == $type][0...$limit]{ "same": $type }'
const params = extractParams(query)
params.map((param) => param.name)
// ['type', 'limit']
params[0].references.map(({ start, end }) => query.slice(start, end))
// ['$type', '$type']
```

```typescript
interface QueryParam {
  name: string // Without the `$`
  references: ParamReference[] // Source order, never empty
}

interface ParamReference {
  start: number // Inclusive index of the `$` (UTF-16 code units)
  end: number // Exclusive index (UTF-16 code units)
  line: number // 1-based line of `start`
  column: number // 1-based column of `start` (UTF-16 code units)
  endLine: number
  endColumn: number
}
```

- Parameters are found in filters, projections, slices, element indexes, function arguments and nested subqueries.
- `$name` text inside strings and comments is not a reference.
- Parameters bound by a custom function (`fn ns::f($p) = ...`) are not reported from inside that function's body.
- An empty or whitespace-only query returns `[]`. Invalid syntax throws `WasmError` with code `PARSE_ERROR`, like `lint()` and `format()`.

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
| `count-in-correlated-subquery` | info     | count() on correlated subqueries                     |
| `very-large-query`             | error    | Query exceeds 10KB                                   |
| `extremely-large-query`        | error    | Query exceeds 100KB                                  |
| `many-joins`                   | warning  | Query has >10 dereference operators                  |
| `unlimited-query`              | warning  | Top-level query without a slice or element limit     |

## Error Handling

The default entry initializes WASM on import, so `NOT_INITIALIZED` is not raised from that entry. The lazy entry (`@sanity-labs/groq-wasm/lazy`) throws it when an API is used before `load()` or `initWasm()` has succeeded.

```typescript
import { WasmError, lint } from '@sanity-labs/groq-wasm/lazy'

try {
  const findings = lint(query)
} catch (error) {
  if (error instanceof WasmError) {
    switch (error.code) {
      case 'NOT_INITIALIZED':
        // Call load() or initWasm() on '@sanity-labs/groq-wasm/lazy' first
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

This package works in modern browsers that support WebAssembly. The default browser entry fetches and initializes the WASM module on import, using top-level await.

```typescript
import { lint, validate } from '@sanity-labs/groq-wasm'

const findings = lint(query)
const parsed = validate(query)
```

When the bundler cannot handle that top-level await, import `@sanity-labs/groq-wasm/lazy` and call `await load()` before using the API.

## Architecture

This package uses a **wrapper crate** approach:

```
packages/groq-wasm/
├── rust/                    # Rust wrapper crate
│   ├── Cargo.toml          # Depends on groq-lint & groq-format
│   └── src/lib.rs          # wasm-bindgen exports
├── wasm/                    # Built WASM output (generated)
├── src/                     # TypeScript wrappers
│   ├── index.ts            # Node entry (sync init)
│   ├── index.browser.ts    # Browser entry (top-level await)
│   ├── index.lazy.ts       # Lazy entry (load / initWasm)
│   ├── params.ts           # Parameter extraction API
│   ├── lint.ts             # Linting API
│   ├── format.ts           # Formatting API
│   ├── validate.ts         # Syntax validation API
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
