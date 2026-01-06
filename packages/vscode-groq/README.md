# GROQ for VS Code

GROQ language support for Visual Studio Code, providing intelligent editing features for [Sanity](https://www.sanity.io) GROQ queries.

## Features

### Syntax Highlighting

Full syntax highlighting for `.groq` files and GROQ queries embedded in JavaScript/TypeScript using the `groq` template tag.

```typescript
import { groq } from 'next-sanity'

const query = groq`
  *[_type == "post"] {
    _id,
    title,
    author->{ name }
  }
`
```

### Diagnostics (Linting)

Real-time linting powered by `@sanity/groq-lint`:

- **Parse errors** - Catch syntax mistakes instantly
- **Performance warnings** - Avoid slow query patterns
- **Schema validation** - Validate against your Sanity schema

### Auto-Completion

Intelligent completions for:

- **Document types** - When typing `_type == "..."`
- **Field names** - Based on your schema
- **System fields** - `_id`, `_type`, `_createdAt`, etc.
- **GROQ functions** - `count()`, `defined()`, `coalesce()`, etc.

### Hover Information

Hover over GROQ elements to see:

- Type information
- Function documentation
- Field descriptions from your schema

### Formatting

Format GROQ queries using Prettier (requires `prettier-plugin-groq`).

### Snippets

Quick snippets for common patterns:

| Prefix     | Description             |
| ---------- | ----------------------- |
| `type`     | Filter by document type |
| `typep`    | Filter with projection  |
| `deref`    | Dereference a reference |
| `groq`     | GROQ template literal   |
| `groqlist` | Paginated list query    |

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "GROQ"
4. Click Install

### Manual Installation

```bash
# Build from source
pnpm build
pnpm package

# Install the .vsix file
code --install-extension vscode-groq-0.0.1.vsix
```

## Configuration

### Settings

| Setting                 | Default | Description                                    |
| ----------------------- | ------- | ---------------------------------------------- |
| `groq.enable`           | `true`  | Enable GROQ language features                  |
| `groq.schemaPath`       | `""`    | Path to schema.json (auto-detected if not set) |
| `groq.maxDiagnostics`   | `100`   | Maximum diagnostics per file                   |
| `groq.enableFormatting` | `true`  | Enable GROQ formatting                         |
| `groq.trace.server`     | `"off"` | LSP trace level (`off`, `messages`, `verbose`) |

### Schema Auto-Discovery

The extension automatically discovers your schema from:

1. `schema.json` in workspace root
2. `sanity.schema.json` in workspace root
3. `.sanity/schema.json`

To generate a schema file:

```bash
npx sanity schema extract --path schema.json
```

## Requirements

- VS Code 1.85.0 or higher
- For schema-aware features: `@sanity/groq-lsp` package

The language server is automatically bundled or can be installed via:

```bash
npm install -D @sanity/groq-lsp
```

## Commands

| Command                         | Description               |
| ------------------------------- | ------------------------- |
| `GROQ: Restart Language Server` | Restart the LSP server    |
| `GROQ: Show Output Channel`     | Show the extension output |

## Supported File Types

| Extension     | Description                                     |
| ------------- | ----------------------------------------------- |
| `.groq`       | Standalone GROQ files                           |
| `.ts`, `.tsx` | TypeScript with `groq\`...\`` template literals |
| `.js`, `.jsx` | JavaScript with `groq\`...\`` template literals |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages (required for LSP server)
pnpm build

# Watch mode for extension only
pnpm --filter vscode-groq watch

# Run tests
pnpm test

# Package extension
pnpm --filter vscode-groq package
```

### Testing in VS Code / Cursor

The easiest way to test the extension during development:

1. **Open the monorepo root** in VS Code or Cursor:

   ```bash
   code /path/to/sanity-lint
   # or
   cursor /path/to/sanity-lint
   ```

2. **Build all packages** (the extension needs the LSP server):

   ```bash
   pnpm build
   ```

3. **Press F5** to launch the Extension Development Host
   - This opens a new editor window with the extension loaded
   - The window opens `dev/editor-test` which has a `schema.json` for testing

4. **Open test files** in the new window:
   - `src/queries-with-issues.ts` - Has intentional GROQ issues
   - `src/queries-nextjs.tsx` - Next.js style queries

5. **Check the GROQ output channel** (View > Output > GROQ) for logs

### What to Test

- **Syntax highlighting**: GROQ in `groq\`...\`` template literals should be colored
- **Diagnostics**: Squiggly lines for lint errors like:
  - `*[_type == "psot"]` → "psot" doesn't exist (typo)
  - `*[author->name == "Bob"]` → join-in-filter warning
- **Hover**: Hover over GROQ elements for type info and documentation
- **Completions**: Type `groq` to see snippet suggestions
- **Schema-aware**: The `dev/editor-test/schema.json` defines `post`, `author`, `category` types

### Debugging Tips

- **View logs**: Open View > Output, select "GROQ" from dropdown
- **Restart LSP**: Run command "GROQ: Restart Language Server"
- **Schema not loading?** Ensure `schema.json` is in the workspace root
- **No errors shown?** Check that the LSP server started (see output channel)

### Launch Configuration

Create `.vscode/launch.json` in the monorepo root:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run GROQ Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}/packages/vscode-groq",
        "${workspaceFolder}/dev/editor-test"
      ],
      "outFiles": ["${workspaceFolder}/packages/vscode-groq/dist/**/*.js"],
      "preLaunchTask": "build-extension"
    }
  ]
}
```

And `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build-extension",
      "type": "shell",
      "command": "pnpm",
      "args": ["--filter", "vscode-groq", "build"],
      "group": "build"
    }
  ]
}
```

## Related Packages

- [`@sanity/groq-lint`](../groq-lint) - GROQ linting rules
- [`@sanity/groq-lsp`](../groq-lsp) - Language Server Protocol implementation
- [`prettier-plugin-groq`](../prettier-plugin-groq) - Prettier plugin for GROQ

## License

MIT
