# prettier-plugin-groq

Prettier plugin for formatting GROQ (Graph-Relational Object Queries) queries.

## Installation

```bash
npm install --save-dev prettier-plugin-groq prettier
# or
pnpm add -D prettier-plugin-groq prettier
```

## Usage

### Formatting `.groq` Files

The plugin automatically formats `.groq` files when loaded:

```bash
npx prettier --write "**/*.groq"
```

Configure in `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-groq"],
  "printWidth": 80
}
```

### Formatting Embedded GROQ in JavaScript/TypeScript

To format GROQ queries embedded in JavaScript/TypeScript files, add the embed plugin:

```json
{
  "plugins": ["prettier-plugin-groq", "prettier-plugin-groq/embed"]
}
```

This formats GROQ in:

- **Tagged template literals**: `groq`...``, `defineQuery`...``
- **Function calls**: `defineQuery("...")`, `defineQuery(`...`)`

```typescript
// Before formatting
const query = groq`*[_type=="post"]{title,body,"author":author->name}`

// After formatting
const query = groq`*[_type == "post"] { title, body, "author": author->name }`
```

## Examples

### Input

```groq
*[_type=="article"&&author._ref==$authorId]{title,"authorName":author->name,publishedAt,categories[]->{title,slug}}
```

### Output

```groq
*[_type == "article" && author._ref == $authorId] {
  title,
  "authorName": author->name,
  publishedAt,
  categories[]->{ title, slug }
}
```

## GROQ Syntax Notes

The formatter follows GROQ syntax rules:

- **Object keys must be quoted** for computed values: `{ "slug": slug.current }`
- **Shorthand is valid** when key matches the attribute: `{ title }` (equivalent to `{ "title": title }`)
- **Projections after dereference** use shorthand: `author->{ name }`
- **Array traversals** use implicit dereference: `categories[]->{ title }`

## WASM Acceleration

For better performance, this plugin can use WASM-compiled Rust for formatting. Initialize WASM at application startup:

```typescript
import { initWasmFormatter, isWasmFormatterAvailable } from 'prettier-plugin-groq'

// Optional: Initialize WASM for better performance
await initWasmFormatter()

if (isWasmFormatterAvailable()) {
  console.log('Using WASM formatter')
}
```

When WASM is available, formatting is ~5-10x faster. The plugin automatically falls back to TypeScript formatting if WASM is not available.

## Options

This plugin respects standard Prettier options:

| Option       | Default | Description                |
| ------------ | ------- | -------------------------- |
| `printWidth` | 80      | Line width for wrapping    |
| `tabWidth`   | 2       | Indentation size           |
| `useTabs`    | false   | Use tabs instead of spaces |

## License

MIT
