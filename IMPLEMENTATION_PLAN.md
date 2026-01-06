# Implementation Plan: Schema-Aware GROQ Tooling

## Overview

Build schema-aware GROQ linting and LSP by leveraging existing Sanity infrastructure:

- **groq-js** - Parser, AST, type evaluator (already in our deps)
- **@sanity/codegen** - Schema reading, query extraction
- **sanity schema extract** - CLI that generates `schema.json`

## Key Discovery: groq-js Has Type Evaluation

```typescript
import { parse, typeEvaluate, SchemaType } from 'groq-js'

const ast = parse('*[_type == "post"]{ title, autor }') // typo: autor
const resultType = typeEvaluate(ast, schema)
// resultType reveals that 'autor' resolves to 'unknown'
```

This is the foundation we need. TypeGen already uses this for generating types.

---

## Stage 1: Schema-Aware GROQ Linting

**Goal**: Catch real bugs like typos in field names, invalid references, wrong types.

### 1.1 Schema Loading

```typescript
// packages/groq-lint/src/schema.ts
import { readSchema } from '@sanity/codegen'
import type { SchemaType } from 'groq-js'

export async function loadSchema(path: string): Promise<SchemaType> {
  return readSchema(path)
}
```

### 1.2 Schema-Aware Rule Interface

Extend our Rule type to support schema context:

```typescript
// packages/core/src/types.ts
interface SchemaAwareRule extends Rule {
  checkWithSchema?(ast: ExprNode, context: LintContext, schema: SchemaType): LintMessage[]
}
```

### 1.3 New Rules Using Type Evaluation

| Rule ID               | Description                          | Example                                           |
| --------------------- | ------------------------------------ | ------------------------------------------------- |
| `unknown-field`       | Field access resolves to unknown     | `*[_type == "post"]{ titel }` (typo)              |
| `invalid-type-filter` | \_type value doesn't exist in schema | `*[_type == "psot"]`                              |
| `type-mismatch`       | Comparing incompatible types         | `*[count > "5"]` (string vs number)               |
| `invalid-reference`   | Reference to non-existent type       | `author->{ name }` where author refs deleted type |

### 1.4 Implementation Approach

```typescript
// packages/groq-lint/src/rules/unknown-field.ts
import { typeEvaluate } from 'groq-js'

export const unknownField: SchemaAwareRule = {
  id: 'unknown-field',
  name: 'Unknown Field',
  description: 'Field does not exist in schema',
  severity: 'error',

  checkWithSchema(ast, context, schema) {
    const messages: LintMessage[] = []

    // Walk projection fields
    walk(ast, (node) => {
      if (node.type === 'AccessAttribute') {
        // Evaluate type at this point
        const parentType = typeEvaluate(node.base, schema)

        // Check if field exists
        if (isUnknown(parentType, node.name)) {
          messages.push({
            ruleId: 'unknown-field',
            message: `Field '${node.name}' does not exist`,
            // Suggest similar fields from schema
            suggestions: findSimilarFields(parentType, node.name),
          })
        }
      }
    })

    return messages
  },
}
```

### 1.5 CLI Integration

```bash
# With schema
sanity-lint --schema schema.json "src/**/*.ts"

# Auto-detect schema.json in project root
sanity-lint "src/**/*.ts"
```

### 1.6 Success Criteria

- [x] Load schema.json via @sanity/codegen
- [x] `unknown-field` rule catches typos in field names
- [x] `invalid-type-filter` catches wrong \_type values
- [x] Suggestions for similar field names (Levenshtein distance)
- [x] Works with ESLint plugin (schema can be passed to linter)

**Status**: Complete

### 1.7 Implementation Notes

**Files created/modified:**

- `packages/groq-lint/src/schema.ts` - Schema loading utilities (Node.js-only, separate entry point)
- `packages/groq-lint/src/rules/invalid-type-filter.ts` - Detects typos in `_type == "value"`
- `packages/groq-lint/src/rules/unknown-field.ts` - Detects unknown fields in projections
- `packages/core/src/types.ts` - Extended with `schema` context and `requiresSchema` flag

**Usage:**

```typescript
import { lint } from '@sanity/groq-lint'
import { loadSchema } from '@sanity/groq-lint/schema'

const schema = await loadSchema('./schema.json')
const result = lint('*[_type == "psot"]{ titel }', { schema })
// Reports: "psot" doesn't exist (suggests "post"), "titel" doesn't exist (suggests "title")
```

---

## Stage 2: GROQ Language Server (LSP)

**Goal**: Real-time feedback in any editor - VS Code, Cursor, Zed, Neovim.

### 2.1 LSP Capabilities

| Capability           | Description                                |
| -------------------- | ------------------------------------------ |
| **Diagnostics**      | Lint errors as you type                    |
| **Hover**            | Show field type, documentation             |
| **Completion**       | Field names, GROQ functions, \_type values |
| **Formatting**       | Use prettier-plugin-groq                   |
| **Go to Definition** | Jump to schema definition (future)         |

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LSP Server                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Schema    │  │   GROQ      │  │   Diagnostics       │  │
│  │   Loader    │  │   Parser    │  │   (lint rules)      │  │
│  │             │  │   (groq-js) │  │   (@sanity/groq-    │  │
│  │ (@sanity/   │  │             │  │    lint)            │  │
│  │  codegen)   │  │             │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              Type Evaluator (groq-js)                 │  │
│  │   typeEvaluate(ast, schema) → TypeNode                │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │                LSP Protocol Handler                   │  │
│  │   textDocument/didOpen, didChange, hover, completion  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
      VS Code              Cursor               Neovim
```

### 2.3 Package Structure

```
packages/
  groq-lsp/
    src/
      server.ts          # LSP server entry
      capabilities/
        diagnostics.ts   # Lint integration
        hover.ts         # Type info on hover
        completion.ts    # Field/function completions
        formatting.ts    # Prettier integration
      schema/
        loader.ts        # Schema loading + watching
        cache.ts         # Schema caching
```

### 2.4 Schema Discovery

```typescript
// Auto-discover schema in project
async function findSchema(workspaceRoot: string): Promise<string | null> {
  const candidates = ['schema.json', 'sanity.schema.json', '.sanity/schema.json']

  for (const candidate of candidates) {
    const path = join(workspaceRoot, candidate)
    if (await exists(path)) return path
  }

  return null
}
```

### 2.5 Embedded GROQ Detection

For JS/TS files, detect GROQ in:

- `groq`...`` tagged template literals
- `defineQuery(`...`)` function calls

Use @sanity/codegen's `findQueriesInSource` or our own ESLint extractor.

### 2.6 Success Criteria

- [x] LSP server starts and connects
- [x] Diagnostics for .groq files
- [x] Diagnostics for embedded GROQ in JS/TS
- [x] Hover shows field types
- [x] Completion for field names
- [x] Format on save works
- [x] Schema hot-reloading on change

**Status**: Complete

### 2.7 Implementation Notes

**Package created:** `packages/groq-lsp` (`@sanity/groq-lsp`)

**Files:**

- `src/server.ts` - Main LSP server (Node IPC)
- `src/capabilities/diagnostics.ts` - Lint integration via @sanity/groq-lint
- `src/capabilities/hover.ts` - Type info and documentation
- `src/capabilities/completion.ts` - Fields, functions, document types
- `src/capabilities/formatting.ts` - Prettier integration
- `src/schema/loader.ts` - Schema loading with file watching
- `src/utils/groq-extractor.ts` - GROQ extraction from JS/TS files

**Usage:**

```bash
# Start server
npx @sanity/groq-lsp

# Or use as library
import { SchemaLoader, computeDocumentDiagnostics } from '@sanity/groq-lsp'
```

---

## Stage 3: Editor Extensions

### 3.1 VS Code Extension

- Language configuration for .groq files
- LSP client connecting to our server
- Syntax highlighting (TextMate grammar)
- Snippets for common patterns

### 3.2 Other Editors

- **Neovim**: LSP config in documentation
- **Zed**: Extension or LSP config
- **Cursor**: Should work via VS Code extension

**Status**: Complete

### 3.3 Implementation Notes

**Package created:** `packages/vscode-groq`

**Files:**

- `package.json` - VS Code extension manifest with contributions
- `src/extension.ts` - LSP client connecting to @sanity/groq-lsp
- `language-configuration.json` - Brackets, comments, auto-close pairs
- `syntaxes/groq.tmLanguage.json` - TextMate grammar for .groq files
- `syntaxes/groq-injection.tmLanguage.json` - Injection grammar for groq`...` in JS/TS
- `snippets/groq.json` - GROQ snippets for .groq files
- `snippets/groq-ts.json` - GROQ snippets for JS/TS files

**Features:**

- Syntax highlighting for .groq files and embedded GROQ in JS/TS
- Diagnostics (linting) via LSP
- Auto-completion for fields, functions, document types
- Hover information (types and documentation)
- Formatting via prettier-plugin-groq
- Configurable settings (schema path, max diagnostics, formatting)
- Commands: Restart Server, Show Output Channel

**Usage:**

```bash
# Build and package
cd packages/vscode-groq
pnpm build
pnpm package

# Install the .vsix
code --install-extension vscode-groq-0.0.1.vsix
```

---

## Stage 4: WASM Core (groq-lint + groq-format)

**Goal**: Replace duplicated TS implementations with Rust tools compiled to WASM.

### 4.1 Background

We currently maintain TS ports of Rust tools:

- **groq-lint rules** - TS reimplementations of [atombender/groq-lint](https://github.com/atombender/groq-lint)
- **prettier-plugin-groq** - TS reimplementation of [atombender/groq-format](https://github.com/atombender/groq-format)

By compiling Rust to WASM, we get:

- Single source of truth (Rust implementation)
- No Rust toolchain required for users (just npm install)
- Better performance (Rust is faster)
- Automatic rule parity

### 4.2 New Package: @sanity/groq-wasm

```
packages/groq-wasm/
├── package.json
├── src/
│   ├── index.ts           # Main exports
│   ├── lint.ts            # Linting wrapper
│   ├── format.ts          # Formatting wrapper
│   ├── wasm-loader.ts     # WASM initialization
│   └── types.ts           # TS types
├── wasm/
│   ├── groq_lint_bg.wasm
│   └── groq_format_bg.wasm
└── scripts/
    └── build-wasm.sh      # Fetch + build WASM from Rust repos
```

### 4.3 API Design

```typescript
// @sanity/groq-wasm
import { lint, format, initWasm } from '@sanity/groq-wasm'

// Initialize (call once at startup)
await initWasm()

// Linting
const findings = lint('*[_type == "post"]{ author-> }')
// → [{ ruleId: 'join-in-filter', message: '...' }]

// Formatting
const formatted = format('*[_type=="post"]{title,body}')
// → '*[_type == "post"]{ title, body }'
```

### 4.4 Tasks

**4.4.1 Rust wrapper crate (no forking needed!)**

- [x] Create wrapper crate at `packages/groq-wasm/rust/`
- [x] Depend on groq-lint and groq-format as git dependencies in Cargo.toml
- [x] Add wasm-bindgen annotations to expose functions
- [x] Create build script (`scripts/build-wasm.sh`)
- [x] Build WASM with wasm-pack
- [x] Create GitHub Actions for WASM builds

**4.4.2 Create @sanity/groq-wasm package**

- [x] Create packages/groq-wasm/ directory structure
- [x] Implement WASM loader (handles async init, browser vs Node)
- [x] Create TS wrapper for lint function
- [x] Create TS wrapper for format function
- [x] Map Rust types to TS types (Finding, FormatOptions, etc.)
- [x] Handle rule ID conversion (snake_case → kebab-case)
- [x] Add comprehensive tests
- [x] Integrate actual WASM output (working with Node.js)

**4.4.3 Migrate @sanity/groq-lint**

- [x] Replace TS rule implementations with WASM lint() calls
- [x] Keep schema-aware rules in TS (unknown-field, invalid-type-filter)
- [x] Create hybrid linter: WASM for pure GROQ, TS for schema rules
- [x] Add `initLinter()` and `isWasmAvailable()` API
- [x] Update CLI to use WASM backend
- [ ] Run parity tests (TS vs WASM output)

**4.4.4 Migrate prettier-plugin-groq**

- [x] Replace TS printer with WASM format() calls
- [x] Keep Prettier plugin interface
- [x] Map Prettier options → groq-format options
- [x] Add `initWasmFormatter()` and `isWasmFormatterAvailable()` API
- [x] Update LSP formatting to use WASM

### 4.5 Success Criteria

- [x] WASM modules load in Node.js 20+
- [x] No native dependencies (pure WASM + JS)
- [x] WASM integrated into @sanity/groq-lint (hybrid linter)
- [x] WASM integrated into prettier-plugin-groq
- [x] All existing tests pass (372 tests passing)
- [x] CLI uses WASM backend
- [x] LSP uses WASM for linting and formatting
- [x] GitHub Actions builds WASM automatically
- [ ] 100% finding parity with Rust groq-lint (parity tests pending)
- [ ] Performance benchmarks

**Status**: Complete (optional parity tests and benchmarks remaining)

### 4.6 Implementation Notes

**Package created:** `packages/groq-wasm` (`@sanity/groq-wasm`)

**Rust wrapper crate:** `packages/groq-wasm/rust/`

- Depends on groq-lint and groq-format as git dependencies (no forking!)
- Uses wasm-bindgen for JS interop
- Build command: `wasm-pack build --target nodejs --out-dir ../wasm --out-name groq_wasm`

**WASM output:**

- `wasm/groq_wasm.js` - Generated JS bindings (CommonJS for Node.js)
- `wasm/groq_wasm_bg.wasm` - Compiled WASM binary (~296KB)

**Usage:**

```typescript
// Direct WASM usage
import { initWasm, lint, format } from '@sanity/groq-wasm'

await initWasm()

const findings = lint('*[_type == "post"]{ author-> }')
// → [{ ruleId: 'join-in-filter', message: '...' }]

const formatted = format('*[_type=="post"]{title,body}')
// → '*[_type == "post"]{ title, body }'

// Via @sanity/groq-lint (hybrid linter)
import { initLinter, lint, isWasmAvailable } from '@sanity/groq-lint'

await initLinter() // Optional, enables WASM
console.log(isWasmAvailable()) // true
const result = lint('*[author->name == "Bob"]')
// Uses WASM for pure GROQ rules, TS for schema-aware rules

// Via prettier-plugin-groq
import { initWasmFormatter, isWasmFormatterAvailable } from 'prettier-plugin-groq'

await initWasmFormatter() // Optional, enables WASM formatting
const formatted = await prettier.format(query, { parser: 'groq', plugins: [...] })
```

---

## Stage 5: OxLint Integration

**Goal**: Enable GROQ linting in [OxLint](https://oxc.rs/) via their JS plugin system.

### 5.1 Background

OxLint (October 2025) introduced [JS plugins](https://oxc.rs/blog/2025-10-09-oxlint-js-plugins.html):

- ESLint-compatible plugin API
- 15x faster than ESLint even with JS plugins
- Many existing ESLint plugins work without modification

### 5.2 Integration Strategy

**Option A: ESLint Plugin Compatibility (try first)** ✅ WORKS!

- Test if eslint-plugin-sanity works with OxLint's ESLint compat layer
- Minimal work if it works out of the box

**Option B: Native OxLint Plugin (if needed)**

- Not needed - ESLint compat works out of the box

### 5.3 Tasks

**5.3.1 Test ESLint compatibility**

- [x] Install OxLint with JS plugin support enabled
- [x] Configure OxLint to load eslint-plugin-sanity
- [x] Test groq`...` template detection
- [x] Document configuration

**5.3.2 Create native plugin (if needed)**

- Not needed - ESLint plugin works directly with OxLint

**5.3.3 Configuration**

- [x] Support oxlint.config.json
- [x] Document setup in package README

### 5.4 Success Criteria

- [x] OxLint runs GROQ rules on groq`...` templates
- [x] Configuration via oxlint config files
- [x] Performance: 77ms for single file with 92 rules

**Status**: Complete

### 5.5 Implementation Notes

**OxLint Configuration** (`oxlint.config.json`):

```json
{
  "jsPlugins": ["eslint-plugin-sanity"],
  "rules": {
    "sanity/groq-join-in-filter": "error",
    "sanity/groq-deep-pagination": "warn"
  }
}
```

**Usage**:

```bash
oxlint --config oxlint.config.json src/
```

**Findings**:

- eslint-plugin-sanity works with OxLint out of the box
- No native plugin needed
- OxLint JS plugins are still marked as experimental
- Performance is excellent (77ms for single file)

---

## Stage 6: Biome Integration

**Goal**: Enable GROQ linting in Biome when/if possible.

### 6.1 Background

Biome has evolved significantly in 2025:

- [Roadmap 2025](https://biomejs.dev/blog/roadmap-2025/) - Embedded languages on wishlist
- [Plugin RFC](https://github.com/biomejs/biome/discussions/1649) - Community discussion
- [Embedded Language Formatting](https://github.com/biomejs/biome/issues/3334) - Technical design

### 6.2 Research Findings (January 2026)

#### ESLint Migration Path

Biome provides `biome migrate eslint --write` which can:

- Migrate ESLint flat and legacy configs
- Convert rules from 23+ ESLint plugins (React, TypeScript, Unicorn, etc.)
- Handle `.eslintignore` files

**However**: It only migrates rules that Biome has reimplemented natively. Custom plugins like `eslint-plugin-sanity` cannot be migrated.

#### GritQL Plugin System (Biome 2.0)

Biome 2.0 introduced GritQL plugins:

```grit
`groq\`$query\`` where {
  register_diagnostic(
    span = $query,
    message = "Found GROQ query"
  )
}
```

**What GritQL CAN do:**

- Match JavaScript AST patterns including tagged template literals
- Report diagnostics at specific source locations
- Pattern match with metavariables (`$query` captures content)

**What GritQL CANNOT do:**

- Parse the content inside template literals as GROQ
- Call external functions or WASM modules
- Understand GROQ syntax or semantics

#### Embedded Language Support

Biome is working on embedded language formatting ([#3334](https://github.com/biomejs/biome/issues/3334)):

- Currently supports CSS in template literals
- GraphQL support planned
- Architecture uses `JsForeignLanguageFormatter` trait

**Key limitation**: This is NOT a plugin API. Adding new languages requires modifying Biome's Rust source code.

#### WASM Plugins

Community poll showed 79% want TypeScript plugins, only 12% want WASM. Biome team says WASM plugins are "not a focus right now."

### 6.3 Integration Options Analysis

| Approach              | Feasibility      | Notes                                       |
| --------------------- | ---------------- | ------------------------------------------- |
| GritQL pattern        | ❌ Cannot lint   | Can detect `groq\`...\`` but can't validate |
| Embedded language API | ❌ No plugin API | Requires Biome core changes                 |
| WASM plugin           | ❌ Not available | Not being prioritized                       |
| Contribute GROQ       | ⚠️ Possible      | Would need to add GROQ to Biome core        |

### 6.4 Recommendation

**Short term**: Continue using OxLint with `eslint-plugin-sanity` (works today, 77ms performance).

**Medium term**: Monitor these Biome developments:

- WASM plugin support (would let us call `@sanity/groq-wasm`)
- Embedded language plugin API (would let us register GROQ parser)
- TypeScript plugins with external call capability

**Long term option**: Contribute GROQ as a first-class language to Biome (significant commitment).

### 6.5 Tasks

- [x] Research Biome plugin system (GritQL)
- [x] Research ESLint migration path
- [x] Research embedded language architecture
- [x] Evaluate WASM plugin timeline
- [ ] Monitor Biome roadmap for plugin extensibility
- [ ] Consider contributing GROQ parser to Biome (if community interest)

### 6.6 References

- [Biome Linter Plugins](https://biomejs.dev/linter/plugins/) - GritQL syntax
- [Biome 2025 Roadmap](https://biomejs.dev/blog/roadmap-2025/) - Embedded languages
- [Plugin RFC Discussion](https://github.com/biomejs/biome/discussions/1649) - WASM/TS discussion
- [Embedded Formatting Design](https://github.com/biomejs/biome/issues/3334) - Architecture
- [ESLint Migration Guide](https://biomejs.dev/guides/migrate-eslint-prettier/) - Migration path

**Status**: Blocked (no viable integration path currently exists)

---

## Stage 7: MCP Server for AI Agents

**Goal**: Let AI assistants validate GROQ before suggesting it.

### 7.1 MCP Tools

```typescript
// tools exposed via MCP
{
  "lint-groq": {
    description: "Lint a GROQ query for issues",
    input: { query: string, schema?: string },
    output: { valid: boolean, messages: LintMessage[] }
  },
  "format-groq": {
    description: "Format a GROQ query",
    input: { query: string },
    output: { formatted: string }
  },
  "explain-groq": {
    description: "Explain what a GROQ query does",
    input: { query: string, schema?: string },
    output: { explanation: string, returnType: TypeNode }
  }
}
```

### 7.2 Integration

AI agents could:

1. Lint GROQ before suggesting to user
2. Auto-fix common issues
3. Understand query return types
4. Generate queries that match schema

**Status**: Not Started

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Rust Source (upstream)                       │
│  ┌─────────────────────┐     ┌─────────────────────┐            │
│  │ atombender/groq-lint│     │atombender/groq-format│            │
│  └──────────┬──────────┘     └──────────┬──────────┘            │
└─────────────┼───────────────────────────┼───────────────────────┘
              │ wasm-pack                  │ wasm-pack
              ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              @sanity/groq-wasm (Stage 4 - new)                   │
│         lint(query) → Finding[]                                  │
│         format(query) → string                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ @sanity/groq- │    │eslint-plugin- │    │oxlint-plugin- │
│     lint      │    │    sanity     │    │    sanity     │
│  (refactored) │    │  (existing)   │    │  (Stage 5)    │
└───────┬───────┘    └───────────────┘    └───────────────┘
        │
        ├── WASM rules (pure GROQ)
        └── TS rules (schema-aware: unknown-field, invalid-type-filter)

┌───────────────────────────────────────────────────────────────┐
│                    Unique TS Packages (keep)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ @sanity/lint-   │  │ @sanity/schema- │  │ @sanity/groq- │  │
│  │     core        │  │     lint        │  │     lsp       │  │
│  │ (types, tester) │  │ (13 TS rules)   │  │               │  │
│  └─────────────────┘  └─────────────────┘  └───────┬───────┘  │
│                                                    │          │
│                                             ┌──────┴──────┐   │
│                                             │  vscode-    │   │
│                                             │    groq     │   │
│                                             └─────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## Dependencies

### New Dependencies Needed

```json
{
  "@sanity/codegen": "^5.1.0", // Schema reading (Stage 1 - done)
  "vscode-languageserver": "^9.0.0", // LSP server (Stage 2 - done)
  "vscode-languageclient": "^9.0.0", // VS Code extension (Stage 3 - done)
  "@modelcontextprotocol/sdk": "...", // MCP server (Stage 7)
  "wasm-bindgen": "..." // WASM TS bindings (Stage 4)
}
```

### Rust Toolchain (build-time only)

```bash
# Only needed for building WASM, not for end users
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### Already Have

```json
{
  "groq-js": "^1.14.0" // Parser, AST, typeEvaluate - keep for schema-aware rules
}
```

---

## Open Questions

### Schema-Aware (Stages 1-3)

1. **Schema sync**: How to keep schema.json in sync with Studio changes?
   - Watch mode in LSP ✅ (implemented)
   - Pre-commit hook to regenerate
   - Studio plugin to auto-export on save

2. **Workspace support**: Multi-workspace projects with different schemas?

3. **Performance**: Large schemas + many queries - need caching strategy

4. **Query variables**: How to type-check `$param` usage?

### WASM Core (Stage 4)

5. ~~**Upstream vs Fork**~~: **RESOLVED** - Use wrapper crate approach
   - Create thin Rust crate that depends on atombender repos as Cargo git dependencies
   - Add wasm-bindgen bindings only in our wrapper
   - No forking or PRs to upstream needed

6. **WASM initialization**: Sync vs async API?
   - Sync simpler but blocks on first call
   - Async requires `await initWasm()` but non-blocking

7. **Browser support**: Do we need browser WASM or Node.js only?
   - LSP/CLI are Node.js only
   - ESLint/OxLint are Node.js only
   - Browser could enable online playground

8. **Fallback strategy**: Keep TS implementation as fallback for WASM failures?
   - Increases maintenance burden
   - But provides safety net

### OxLint (Stage 5)

9. **ESLint compat stability**: OxLint JS plugins are experimental - acceptable risk?

10. **Native vs compat**: If ESLint plugin works, is native plugin worth the effort?
    - Native = better performance
    - Compat = less code to maintain

---

## Priority Recommendation

### Completed

- ~~Stage 1~~ - Schema-aware linting ✅
- ~~Stage 2~~ - LSP server ✅
- ~~Stage 3~~ - VS Code extension ✅
- ~~Stage 4~~ - WASM Core ✅ (all integrations complete)
- ~~Stage 5~~ - OxLint integration ✅ (ESLint plugin works out of the box!)
- ~~Stage 6~~ - Biome research ✅ (blocked - GritQL-based, no WASM support)

### Stage 4 Summary

- ✅ @sanity/groq-wasm package with Rust WASM bindings
- ✅ @sanity/groq-lint hybrid linter (WASM + TS)
- ✅ prettier-plugin-groq WASM formatter
- ✅ CLI uses WASM backend
- ✅ LSP uses WASM for linting and formatting
- ✅ GitHub Actions builds WASM automatically
- ✅ All 372 tests passing
- Optional: parity tests, performance benchmarks

### Next Up

1. **Stage 7 (MCP)** - Optional AI agent integration
2. **Parity tests** - Verify TS vs WASM output matches (optional)
3. **Benchmarks** - Performance comparisons (optional)

---

## Risks

| Risk                                 | Impact | Mitigation                          |
| ------------------------------------ | ------ | ----------------------------------- |
| WASM performance worse than expected | Medium | Benchmark early in Stage 4.4.2      |
| Rust repos unmaintained              | High   | Fork early, or contribute upstream  |
| OxLint plugin API changes            | Medium | Pin versions, track releases        |
| Biome never ships plugins            | Low    | Not blocking other work             |
| Breaking changes for users           | Medium | Major version bump, migration guide |

---

## References

### Completed Stages

- [Sanity TypeGen Docs](https://www.sanity.io/docs/apis-and-sdks/sanity-typegen)
- [groq-js source](https://github.com/sanity-io/groq-js)
- [@sanity/codegen source](https://github.com/sanity-io/sanity/tree/next/packages/@sanity/codegen)
- [LSP Specification](https://microsoft.github.io/language-server-protocol/)

### WASM (Stage 4)

- [atombender/groq-lint](https://github.com/atombender/groq-lint) - Rust linter
- [atombender/groq-format](https://github.com/atombender/groq-format) - Rust formatter
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) - Rust → WASM toolchain
- [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) - JS ↔ WASM bindings
- [SWC architecture](https://swc.rs/) - Reference for Rust → npm distribution

### OxLint (Stage 5)

- [OxLint JS Plugins](https://oxc.rs/blog/2025-10-09-oxlint-js-plugins.html) - Plugin announcement
- [OxLint Configuration](https://oxc.rs/docs/guide/usage/linter/config) - Config format

### Biome (Stage 6)

- [Biome Plugin Discussion](https://github.com/biomejs/biome/discussions/231) - Custom rules RFC
- [Biome Plugin RFC](https://github.com/biomejs/biome/discussions/1762) - Implementation discussion

### MCP (Stage 7)

- [MCP Specification](https://modelcontextprotocol.io/)
