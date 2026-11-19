# @sanity-labs/groq-lsp

Language Server Protocol (LSP) implementation for GROQ - provides IDE features for GROQ queries in any editor.

## Features

| Feature         | Description                                |
| --------------- | ------------------------------------------ |
| **Diagnostics** | Real-time linting via `@sanity/groq-lint`  |
| **Hover**       | Type information and documentation         |
| **Completion**  | Field names, functions, document types     |
| **Formatting**  | Via `@sanity-labs/groq-wasm` (groq-format) |

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

The server uses the first schema it finds:

1. The `schemaPath` setting.
2. A schema file in the first workspace folder: `schema.json`, `sanity.schema.json`, `.sanity/schema.json` or `studio/schema.json`.
3. The schema [groq-content-mapper](https://github.com/sanity-labs/groq-content-mapper) is configured with in the `tsconfig.json` nearest the document: the `schemas` entry whose deepest folder contains the document, else `schema`.

The server reloads the schema when it receives `workspace/didChangeWatchedFiles` events for these files and for `tsconfig.json` (it registers watchers itself when the client supports dynamic registration), and re-lints open documents.

### groq-content-mapper settings

The server reads the `contentMappers` entry for `@sanity-labs/groq-content-mapper` from the `tsconfig.json` nearest each document, as the mapper's loaders do:

```jsonc
// tsconfig.json
{
  "contentMappers": [
    {
      "package": "@sanity-labs/groq-content-mapper",
      "extensions": [".groq"],
      "options": { "schema": "./schema.json", "functions": ["groq/*.groq"] },
    },
  ],
}
```

Besides locating the schema, the `functions` option lists files of shared [custom GROQ functions](https://www.sanity.io/docs/content-lake/custom-groq-functions). A query in a file with one of the mapper's `extensions` that calls one is linted with the definitions it needs prepended, as the mapper's loaders deliver it, so the call is not a parse error. Findings are reported at their place in the query; those inside the prepended definitions are left out. Problems with the options or the functions files are logged to the server output.

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

| Language   | File Types    | Query Detection                                                            |
| ---------- | ------------- | -------------------------------------------------------------------------- |
| GROQ       | `.groq`       | Entire file                                                                |
| TypeScript | `.ts`, `.tsx` | `groq`...``, `defineQuery(`...`)` and `/* groq */ `...`` template literals |
| JavaScript | `.js`, `.jsx` | `groq`...``, `defineQuery(`...`)` and `/* groq */ `...`` template literals |

## LSP Capabilities

### Diagnostics

Automatically validates GROQ queries on document change:

- **Performance rules** - Always enabled (join-in-filter, pagination, etc.)
- **Schema-aware rules** - When schema is available (invalid-type-filter, unknown-field)

Queries that interpolate fragments are linted with the fragments inlined, as they are sent:

```ts
import { author } from './fragments'

const query = defineQuery(`*[_type == "article"]{ author->${author} }`)
```

A fragment can be declared in the same file or imported, through relative paths, `tsconfig.json` `paths` and `baseUrl`, and packages in `node_modules` such as the packages of a workspace. Fragments are `groq` templates, `defineQuery()` calls, strings, `+` concatenations of those, and `.groq` files. A query with a `${}` that cannot be resolved this way, such as a function call, is not linted. Editing an open fragment re-lints the queries that use it.

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

Formats GROQ queries with [groq-format](https://github.com/atombender/groq-format) through `@sanity-labs/groq-wasm`, wrapped to `printWidth` (default 80) and indented with `tabSize` spaces, or tabs when `insertSpaces` is `false`:

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

### `resolveQueryFragments`

Inlines the `${}` fragments of the interpolated queries `extractQueries` found, so diagnostics lint the query that runs. The host reads files; `realpath` is optional.

```typescript
import { readFile, realpath } from 'node:fs/promises'

const host = {
  readFile: (file) => readFile(file, 'utf8').catch(() => undefined),
  realpath,
}
const resolved = await resolveQueryFragments(content, '/path/to/file.ts', queries, host)
const diagnostics = computeDocumentDiagnostics(resolved, { schema })
```

`@sanity-labs/groq-lsp/fragments` has the resolver without the language server's dependencies: `resolveEmbeddedQueries(content, file, host)` returns each `groq` template and `defineQuery()` call of a file with its fragments inlined, for tools such as an editor's run-query command.

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

Formats GROQ queries with groq-format through `@sanity-labs/groq-wasm`. Queries that do not parse produce no edits.

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
- [`groq-wasm`](../groq-wasm) - WASM bindings for groq-lint and groq-format
- [`prettier-plugin-groq`](../prettier-plugin-groq) - Prettier plugin for GROQ
- [`@sanity/eslint-plugin`](../eslint-plugin) - ESLint plugin for Sanity

## License

MIT
