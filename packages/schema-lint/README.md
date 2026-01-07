# @sanity/schema-lint

Sanity schema linter for catching common issues and enforcing best practices.

## Installation

```bash
npm install @sanity/schema-lint
# or
pnpm add @sanity/schema-lint
```

## Usage

### Programmatic API

```typescript
import { lint } from '@sanity/schema-lint'

// Lint a schema type definition
const result = lint({
  name: 'post',
  type: 'document',
  fields: [{ name: 'title', type: 'string' }],
})

for (const finding of result.findings) {
  console.log(`${finding.ruleId}: ${finding.message}`)
}
```

### Lint Multiple Schemas

```typescript
import { lintSchemas } from '@sanity/schema-lint'

const schemas = [
  { name: 'post', type: 'document', fields: [...] },
  { name: 'author', type: 'document', fields: [...] },
]

const results = lintSchemas(schemas)
```

### With Configuration

```typescript
import { lint } from '@sanity/schema-lint'

const result = lint(schema, {
  config: {
    rules: {
      'missing-description': false, // Disable rule
      'missing-icon': { enabled: true, severity: 'warning' },
    },
  },
})
```

## Rules

### Core Rules

| Rule                      | Severity | Description                                    |
| ------------------------- | -------- | ---------------------------------------------- |
| `missing-define-type`     | warning  | Schema should use `defineType()`               |
| `missing-define-field`    | warning  | Fields should use `defineField()`              |
| `missing-icon`            | warning  | Document types should have an icon             |
| `missing-title`           | info     | Types should have a title                      |
| `missing-description`     | info     | Types should have a description                |
| `presentation-field-name` | warning  | Avoid field names that clash with presentation |

### Field Rules

| Rule                          | Severity | Description                                |
| ----------------------------- | -------- | ------------------------------------------ |
| `boolean-instead-of-list`     | info     | Consider list instead of boolean           |
| `missing-slug-source`         | warning  | Slug fields should have a source           |
| `missing-required-validation` | info     | Consider adding required validation        |
| `reserved-field-name`         | error    | Field name conflicts with Sanity internals |

### Array & Reference Rules

| Rule                        | Severity | Description                                  |
| --------------------------- | -------- | -------------------------------------------- |
| `array-missing-constraints` | warning  | Arrays should have min/max constraints       |
| `heading-level-in-schema`   | info     | Heading levels belong in content, not schema |
| `unnecessary-reference`     | info     | Reference could be simplified                |

## API Reference

### `lint(schema: SchemaType, options?: LintOptions): LintResult`

Lint a single schema type definition.

```typescript
interface LintOptions {
  config?: SchemaLinterConfig
}

interface LintResult {
  schema: SchemaType
  findings: Finding[]
}
```

### `lintSchemas(schemas: SchemaType[], options?: LintOptions): LintResult[]`

Lint multiple schema type definitions.

### Rules Array

```typescript
import { rules } from '@sanity/schema-lint'

// All 13 rules
console.log(rules.map((r) => r.id))
```

### Individual Rule Imports

```typescript
import { missingIcon, reservedFieldName } from '@sanity/schema-lint'

// Use individual rules
const customRules = [missingIcon, reservedFieldName]
```

## License

MIT
