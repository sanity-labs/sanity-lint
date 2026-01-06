# @sanity/dev-tools

Sanity Developer Experience Suite - linting, formatting, and static analysis for Sanity projects.

## Architecture

### Monorepo Structure

- **Package manager**: pnpm workspaces
- **Build orchestration**: Turborepo
- **Testing**: Vitest with custom RuleTester pattern
- **Bundling**: tsup (ESM + CJS dual output)
- **Versioning**: Changesets

### Packages

| Package                         | npm Name               | Purpose                             |
| ------------------------------- | ---------------------- | ----------------------------------- |
| `packages/core`                 | `@sanity/lint-core`    | Shared types, RuleTester, reporters |
| `packages/groq-lint`            | `@sanity/groq-lint`    | GROQ query linting rules + CLI      |
| `packages/schema-lint`          | `@sanity/schema-lint`  | Sanity schema linting rules         |
| `packages/groq-lsp`             | `@sanity/groq-lsp`     | Language Server Protocol for GROQ   |
| `packages/eslint-plugin`        | `eslint-plugin-sanity` | ESLint integration                  |
| `packages/vscode-groq`          | `vscode-groq`          | VS Code/Cursor extension            |
| `packages/prettier-plugin-groq` | `prettier-plugin-groq` | Prettier plugin for GROQ formatting |

### Dependency Graph

```
@sanity/lint-core
       ↓
@sanity/groq-lint  →  eslint-plugin-sanity
       ↓
@sanity/groq-lsp   →  vscode-groq
```

## Development

### Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm lint             # Lint codebase
pnpm typecheck        # Type check
```

### Adding a New Rule

1. Create rule file: `packages/groq-lint/src/rules/{rule-name}.ts`
2. Create test file: `packages/groq-lint/src/rules/__tests__/{rule-name}.test.ts`
3. Export from `packages/groq-lint/src/rules/index.ts`
4. Add to default ruleset in `packages/groq-lint/src/index.ts`

Use `/add-rule` skill to scaffold automatically.

## Conventions

### Rule Implementation

Every rule must:

- Have a unique `id` matching the filename (kebab-case)
- Have `name`, `description`, `severity`
- Implement the `check(ast)` method
- Have 100% test coverage
- Match behavior of Rust groq-lint (if porting)

```typescript
// packages/groq-lint/src/rules/join-in-filter.ts
import type { Rule } from '@sanity/lint-core'

export const joinInFilter: Rule = {
  id: 'join-in-filter',
  name: 'Join in Filter',
  description: 'Avoid `->` inside filters. It prevents optimization.',
  severity: 'error',

  check(ast, context) {
    // Implementation
  },
}
```

### Test Structure

Use the RuleTester pattern with `valid` and `invalid` cases:

```typescript
// packages/groq-lint/src/rules/__tests__/join-in-filter.test.ts
import { RuleTester } from '@sanity/lint-core'
import { joinInFilter } from '../join-in-filter'

const tester = new RuleTester()

tester.run('join-in-filter', joinInFilter, {
  valid: [
    '*[_type == "post"]',
    '*[_type == "post"]{ author-> }', // projection OK
  ],
  invalid: [
    {
      code: '*[author->name == "Bob"]',
      errors: [{ ruleId: 'join-in-filter' }],
    },
  ],
})
```

### Commit Messages

Follow Conventional Commits:

```
feat(groq-lint): add join-in-filter rule
fix(core): handle empty query input
test(groq-lint): add edge cases for deep-pagination
docs: update README with usage examples
```

### Git Workflow

#### Feature Branch Development

All non-trivial changes must go through feature branches and PRs:

1. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feat/my-feature    # New feature
   git checkout -b fix/bug-name       # Bug fix
   git checkout -b docs/update-readme # Documentation
   ```

2. **Develop incrementally** - commit working code as features complete, not at the end

3. **Push and create PR** when ready:

   ```bash
   git push -u origin feat/my-feature
   gh pr create --fill  # Or use GitHub web UI
   ```

4. **PR must pass all CI checks** before merge (see CI section below)

5. **Squash merge** to main with a clean commit message

#### Branch Naming

| Prefix      | Purpose           | Example                     |
| ----------- | ----------------- | --------------------------- |
| `feat/`     | New features      | `feat/deep-pagination-rule` |
| `fix/`      | Bug fixes         | `fix/ast-traversal-error`   |
| `docs/`     | Documentation     | `docs/api-reference`        |
| `refactor/` | Code refactoring  | `refactor/rule-tester`      |
| `test/`     | Test improvements | `test/coverage-edge-cases`  |
| `chore/`    | Maintenance       | `chore/update-deps`         |

#### Before Creating a PR

```bash
pnpm build          # Build all packages
pnpm test           # Run tests
pnpm lint           # Check linting
pnpm format:check   # Check formatting
pnpm typecheck      # Type check
```

### CI/CD Pipeline

GitHub Actions runs on every push to `main` and on all PRs:

| Job                 | What it checks                    |
| ------------------- | --------------------------------- |
| **Lint & Format**   | ESLint rules, Prettier formatting |
| **Type Check**      | TypeScript compilation            |
| **Test**            | Unit tests on Node 20 & 22        |
| **Commit Messages** | Conventional Commits (PRs only)   |

All jobs must pass before merging. CI configuration: `.github/workflows/ci.yml`

#### Required Status Checks

PRs require:

- All CI jobs passing
- At least one approval (when collaborators are added)
- Up-to-date with main branch

## Key References

### Rule Specifications

See `.claude/reference/rules.yaml` for the canonical rule definitions from Rust groq-lint.

### GROQ AST Types

The `groq-js` package exports AST types:

- `ExprNode` - Base expression node
- `FilterNode` - `*[constraint]`
- `ProjectionNode` - `{ field1, field2 }`
- `DerefNode` - `->` dereference
- See `.claude/reference/groq-ast-types.md` for full reference

### External Resources

- [groq-lint (Rust)](https://github.com/sanity-io/groq-lint) - Reference implementation
- [groq-js](https://github.com/sanity-io/groq-js) - GROQ parser we use
- [groq-test-suite](https://github.com/sanity-io/groq-test-suite) - Test corpus
- [ESLint RuleTester](https://eslint.org/docs/latest/integrate/nodejs-api#ruletester) - Testing pattern

## Quality Standards

### Test Coverage

- Rules: 100% coverage required
- Core utilities: 90%+ coverage
- Integration tests for ESLint plugin

### CI Checks

All PRs must pass these automated checks (see `.github/workflows/ci.yml`):

- [ ] Format check (`pnpm format:check`)
- [ ] Lint (`pnpm lint`)
- [ ] Type check (`pnpm typecheck`)
- [ ] Tests (`pnpm test`) - runs on Node 20 & 22
- [ ] Build (`pnpm build`)
- [ ] Commit message validation (Conventional Commits)

### Rust Parity

When porting rules from groq-lint:

- Must produce identical findings for the same query
- Run `pnpm test:rust-parity` to verify
- Document any intentional differences

## Documentation Requirements

When adding new features or packages:

1. **Package README**: Every package must have a README.md with:
   - What it does
   - Installation instructions
   - Usage examples
   - API reference (if applicable)

2. **Main README**: Update the root README.md to include:
   - New packages in the packages table
   - Update architecture diagram if needed

3. **CLAUDE.md**: Update this file with:
   - New packages in the packages table
   - Dependency graph changes

4. **IMPLEMENTATION_PLAN.md**: If working from a plan:
   - Update status as stages complete
   - Add implementation notes with files created
