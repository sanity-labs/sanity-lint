# Editor Test

Test files for validating GROQ linting in VS Code, Cursor, and other editors.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Open this folder in VS Code/Cursor:

   ```bash
   code dev/editor-test
   # or
   cursor dev/editor-test
   ```

3. Make sure the ESLint extension is installed (should be prompted)

## Test Files

### GROQ Queries

- **`src/queries-with-issues.ts`** - Queries that SHOULD trigger lint warnings
- **`src/queries-clean.ts`** - Queries that should NOT trigger any warnings
- **`src/queries-nextjs.tsx`** - Real-world Next.js patterns with JSX

### Schema

- **`schema.json`** - Sample schema for testing schema-aware rules
- **`src/schemas/`** - Sanity schema TypeScript definitions

## CLI Commands

### Linting

```bash
# Lint with ESLint (all rules via @sanity-labs/eslint-plugin)
pnpm lint

# Lint GROQ with schema (catches typos in types and fields)
pnpm lint:groq

# Lint GROQ without schema (performance rules only)
pnpm lint:groq:no-schema
```

### Formatting

```bash
# Format all files with Prettier (includes GROQ in template literals)
pnpm format

# Check formatting without writing
pnpm format:check
```

## Schema-Aware Rules

The linter supports schema-aware rules that catch typos and invalid references:

| Rule                  | Description                           | Example                                          |
| --------------------- | ------------------------------------- | ------------------------------------------------ |
| `invalid-type-filter` | `_type` value doesn't exist in schema | `*[_type == "psot"]` → suggests "post"           |
| `unknown-field`       | Field doesn't exist on document type  | `*[_type == "post"]{ titel }` → suggests "title" |

To enable schema-aware linting, provide a `schema.json` file (generated via `sanity schema extract`).

## Editor Integration

### What to Look For

1. Open `queries-with-issues.ts` - you should see squiggly lines under problematic queries
2. Open `queries-clean.ts` - you should see NO warnings
3. Hover over warnings to see the rule message and suggested fix
4. Try "Quick Fix" (Cmd+. / Ctrl+.) to see available fixes

### Schema-Aware Warnings

Look for these in `queries-with-issues.ts`:

- `*[_type == "psot"]` → Error: "psot" doesn't exist, did you mean "post"?
- `*[_type == "post"]{ titel }` → Warning: "titel" doesn't exist, did you mean "title"?

### VS Code Settings

The `.vscode/` folder includes recommended settings for:

- ESLint extension
- Format on save with Prettier
- GROQ syntax highlighting (when available)

## Generating Schema

To generate a schema.json from a Sanity project:

```bash
cd your-sanity-project
npx sanity schema extract --path schema.json
```

## Current Status

- ✅ ESLint plugin works for performance rules (no schema required)
- ✅ CLI (`groq-lint`) supports schema-aware rules
- ✅ Prettier plugin formats embedded GROQ
- 🔄 ESLint plugin schema integration (coming soon)
