# @sanity-labs/groq-lsp

Language Server Protocol (LSP) implementation for GROQ - provides IDE features for GROQ queries in any editor.

## Features

| Feature         | Description                               |
| --------------- | ----------------------------------------- |
| **Diagnostics** | Real-time linting via `@sanity/groq-lint` |
| **Hover**       | Type information and documentation        |
| **Completion**  | Field names, functions, document types    |
| **Formatting**  | Via `prettier-plugin-groq`                |

## Installation

```bash
npm install @sanity-labs/groq-lsp
# or
pnpm add @sanity-labs/groq-lsp
```

## Usage

### As a Language Server (CLI)

Start the server using Node IPC:

```bash
npx @sanity-labs/groq-lsp
```

The server communicates via stdio and can be connected to any LSP-compatible editor.

### As a Library

```typescript
import {
  SchemaLoader,
  extractQueries,
  computeDocumentDiagnostics,
  getCompletions,
  getHoverInfo,
  formatQuery,
} from '@sanity-labs/groq-lsp'

// Load schema
const loader = new SchemaLoader()
loader.loadFromPath('./schema.json')
// Or auto-discover: loader.discoverSchema(workspaceRoot)

// Extract GROQ queries from source file
const { queries } = extractQueries(sourceCode, 'typescript')

// Get diagnostics
const diagnostics = computeDocumentDiagnostics(queries, {
  schema: loader.getSchema(),
})

// Get completions at a position
const completions = getCompletions(query, cursorOffset, {
  schema: loader.getSchema(),
})

// Get hover info at a position
const hover = getHoverInfo(query, cursorOffset, {
  schema: loader.getSchema(),
})

// Format a query
const edits = await formatQuery(query, { tabSize: 2 })
```

## Editor Integration

### VS Code

The server is designed to work with VS Code's LSP client. Configure your extension's `package.json`:

```json
{
  "contributes": {
    "languages": [
      {
        "id": "groq",
        "extensions": [".groq"],
        "aliases": ["GROQ"]
      }
    ]
  }
}
```

And in your extension code:

```typescript
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

const serverModule = require.resolve('@sanity-labs/groq-lsp/dist/server.js')

const client = new LanguageClient(
  'groqLanguageServer',
  'GROQ Language Server',
  {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  },
  {
    documentSelector: [
      { scheme: 'file', language: 'groq' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
    ],
  }
)

client.start()
```

### Neovim (nvim-lspconfig)

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.groq_lsp then
  configs.groq_lsp = {
    default_config = {
      cmd = { 'npx', '@sanity-labs/groq-lsp' },
      filetypes = { 'groq', 'typescript', 'typescriptreact' },
      root_dir = lspconfig.util.root_pattern('schema.json', 'sanity.config.ts'),
    },
  }
end

lspconfig.groq_lsp.setup{}
```

## Schema Discovery

The server automatically searches for schema files in these locations:

1. `schema.json`
2. `sanity.schema.json`
3. `.sanity/schema.json`
4. `studio/schema.json`

Generate a schema file from your Sanity project:

```bash
npx sanity schema extract --path schema.json
```

### Configuration

The server accepts configuration via the LSP `workspace/configuration` request:

```typescript
interface Settings {
  // Path to schema.json file
  schemaPath?: string
  // Maximum number of diagnostics to report (default: 100)
  maxDiagnostics?: number
  // Enable formatting (default: true)
  enableFormatting?: boolean
}
```

In VS Code, configure via `settings.json`:

```json
{
  "groq.schemaPath": "./studio/schema.json",
  "groq.maxDiagnostics": 50,
  "groq.enableFormatting": true
}
```

## Supported Languages

The server provides features for:

| Language   | File Types    | Query Detection               |
| ---------- | ------------- | ----------------------------- |
| GROQ       | `.groq`       | Entire file                   |
| TypeScript | `.ts`, `.tsx` | `groq`...`` template literals |
| JavaScript | `.js`, `.jsx` | `groq`...`` template literals |

## LSP Capabilities

### Diagnostics

Automatically validates GROQ queries on document change:

- **Performance rules** - Always enabled (join-in-filter, pagination, etc.)
- **Schema-aware rules** - When schema is available (invalid-type-filter, unknown-field)

### Completion

Provides intelligent completions based on context:

```groq
*[_type == "|"] // Suggests: "post", "author", etc.
*[_type == "post"]{ | } // Suggests: title, body, _id, etc.
cou| // Suggests: count()
```

### Hover

Shows type information and documentation:

```
_type: string
Document type name
```

### Formatting

Formats GROQ queries using `prettier-plugin-groq`:

```groq
// Before
*[_type=="post"&&published==true]{title,body,...}

// After
*[_type == "post" && published == true] {
  title,
  body,
  ...
}
```

## API Reference

### `SchemaLoader`

Manages schema loading and caching.

```typescript
const loader = new SchemaLoader()

// Load from specific path
loader.loadFromPath('./schema.json')

// Auto-discover in workspace
loader.discoverSchema('/path/to/workspace')

// Get current schema
const schema = loader.getSchema()

// Watch for changes
loader.startWatching((newSchema) => {
  console.log('Schema updated')
})

// Clean up
loader.stopWatching()
loader.clear()
```

### `extractQueries`

Extracts GROQ queries from source files.

```typescript
const { queries, errors } = extractQueries(content, 'typescript')
// Returns: { queries: GroqQuery[], errors: string[] }
```

### `computeDocumentDiagnostics`

Computes LSP diagnostics for extracted queries.

```typescript
const diagnostics = computeDocumentDiagnostics(queries, { schema })
// Returns: Diagnostic[]
```

### `getCompletions`

Gets completion items at a position.

```typescript
const items = getCompletions(query, cursorOffset, { schema })
// Returns: CompletionItem[]
```

### `getHoverInfo`

Gets hover information at a position.

```typescript
const hover = getHoverInfo(query, cursorOffset, { schema })
// Returns: Hover | null
```

### `formatQuery` / `formatDocument`

Formats GROQ queries using Prettier.

```typescript
const edits = await formatQuery(query, { tabSize: 2 })
// Returns: TextEdit[]
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Watch mode
pnpm dev
```

## Related Packages

- [`@sanity/groq-lint`](../groq-lint) - GROQ linting rules
- [`prettier-plugin-groq`](../prettier-plugin-groq) - Prettier plugin for GROQ
- [`@sanity/eslint-plugin`](../eslint-plugin) - ESLint plugin for Sanity

## License

MIT
