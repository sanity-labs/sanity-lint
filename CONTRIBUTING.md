# Contributing to Sanity Lint

Thank you for your interest in contributing to Sanity Lint!

## Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build all packages: `pnpm build`
4. Run tests: `pnpm test`

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat:` - A new feature (triggers minor version bump)
- `fix:` - A bug fix (triggers patch version bump)
- `docs:` - Documentation changes only
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code changes that neither fix bugs nor add features
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Breaking Changes

Add `BREAKING CHANGE:` in the footer or `!` after the type to trigger a major version bump:

```
feat!: remove deprecated API

BREAKING CHANGE: The `oldMethod` has been removed. Use `newMethod` instead.
```

### Examples

```
feat(groq-lint): add new rule for detecting N+1 queries
fix(schema-lint): handle edge case in missing-icon rule
docs: update README with new rule documentation
chore: update dependencies
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Ensure all tests pass: `pnpm test`
4. Ensure linting passes: `pnpm lint`
5. Ensure types check: `pnpm typecheck`
6. Submit a pull request

## Adding New Rules

### GROQ Rules

1. Create rule file in `packages/groq-lint/src/rules/`
2. Add tests in `packages/groq-lint/src/rules/__tests__/`
3. Export from `packages/groq-lint/src/rules/index.ts`
4. Add to ESLint plugin in `packages/eslint-plugin/src/index.ts`

### Schema Rules

1. Create rule file in `packages/schema-lint/src/rules/`
2. Add tests in `packages/schema-lint/src/rules/__tests__/`
3. Export from `packages/schema-lint/src/rules/index.ts`
4. Add to ESLint plugin in `packages/eslint-plugin/src/index.ts`

## Code Style

- TypeScript with strict mode
- Prettier for formatting
- oxlint for linting (`oxlint.config.mts`, extending `@nkzw/oxlint-config`)
- Run `pnpm format` before committing

## Questions?

Open an issue for discussion before starting work on large changes.
