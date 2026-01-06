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

- **`src/queries-with-issues.ts`** - Queries that SHOULD trigger lint warnings
- **`src/queries-clean.ts`** - Queries that should NOT trigger any warnings
- **`src/queries-nextjs.tsx`** - Real-world Next.js patterns with JSX

## What to Look For

Once `eslint-plugin-sanity` is implemented:

1. Open `queries-with-issues.ts` - you should see squiggly lines under problematic queries
2. Open `queries-clean.ts` - you should see NO warnings
3. Hover over warnings to see the rule message and suggested fix
4. Try "Quick Fix" (Cmd+. / Ctrl+.) to see available fixes

## Running Lint from CLI

```bash
pnpm lint
```

## Current Status

The ESLint plugin is a placeholder. Once implemented, the rules in `eslint.config.js` will activate.
