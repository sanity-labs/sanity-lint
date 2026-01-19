# @sanity-labs/lint-core

Shared types, utilities, and testing infrastructure for Sanity lint packages.

## Installation

```bash
npm install @sanity-labs/lint-core
# or
pnpm add @sanity-labs/lint-core
```

## Usage

### Types

```typescript
import type { Rule, RuleContext, Finding, Severity, LinterConfig } from '@sanity-labs/lint-core'

// Define a custom rule
const myRule: Rule = {
  id: 'my-rule',
  name: 'My Rule',
  description: 'Checks for something',
  severity: 'warning',
  check(ast, context) {
    // Return findings
    return []
  },
}
```

### Reporting Utilities

```typescript
import { formatFindings, formatFindingsJson, summarizeFindings } from '@sanity-labs/lint-core'

// Format findings for terminal output
const output = formatFindings(findings)

// Format as JSON for CI
const json = formatFindingsJson(findings)

// Get summary statistics
const summary = summarizeFindings(findings)
console.log(`${summary.errorCount} errors, ${summary.warningCount} warnings`)
```

### Testing (Vitest)

Import from the `/testing` subpath to use the RuleTester:

```typescript
import { RuleTester } from '@sanity-labs/lint-core/testing'
import { myRule } from '../my-rule'

const tester = new RuleTester()

tester.run('my-rule', myRule, {
  valid: ['*[_type == "post"]', '*[_type == "post"]{ title }'],
  invalid: [
    {
      code: '*[badPattern]',
      errors: [{ ruleId: 'my-rule' }],
    },
  ],
})
```

### GROQ Validation

```typescript
import { isValidGroq, parseGroq, assertValidGroq } from '@sanity-labs/lint-core/testing'

// Check if GROQ is valid
if (isValidGroq('*[_type == "post"]')) {
  // Valid query
}

// Parse and get AST
const ast = parseGroq('*[_type == "post"]')

// Assert validity (throws on invalid)
assertValidGroq('*[_type == "post"]')
```

## API Reference

### Types

| Type           | Description                              |
| -------------- | ---------------------------------------- |
| `Rule`         | Lint rule interface                      |
| `RuleContext`  | Context passed to rule check functions   |
| `Finding`      | A lint finding (error, warning, or info) |
| `Severity`     | `'error' \| 'warning' \| 'info'`         |
| `LinterConfig` | Configuration for the linter             |
| `SchemaType`   | Re-exported from groq-js                 |

### Reporter Functions

| Function                       | Description                         |
| ------------------------------ | ----------------------------------- |
| `formatFindings(findings)`     | Format findings for terminal output |
| `formatFindingsJson(findings)` | Format findings as JSON             |
| `summarizeFindings(findings)`  | Get error/warning/info counts       |

### Testing Utilities

| Export                   | Description                                |
| ------------------------ | ------------------------------------------ |
| `RuleTester`             | Test harness for lint rules                |
| `isValidGroq(query)`     | Check if GROQ query is syntactically valid |
| `parseGroq(query)`       | Parse GROQ and return AST                  |
| `assertValidGroq(query)` | Assert GROQ is valid (throws on error)     |

## License

MIT
