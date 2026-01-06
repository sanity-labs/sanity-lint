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

> **Note**: Embedded GROQ formatting in JavaScript/TypeScript template literals (like `groq\`...\``) is planned for a future release. For now, use this plugin to format standalone `.groq` files.

For embedded GROQ queries, you can use the ESLint plugin (`eslint-plugin-sanity`) to lint GROQ inside template literals.

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

## Options

This plugin respects standard Prettier options:

| Option       | Default | Description                |
| ------------ | ------- | -------------------------- |
| `printWidth` | 80      | Line width for wrapping    |
| `tabWidth`   | 2       | Indentation size           |
| `useTabs`    | false   | Use tabs instead of spaces |

## License

MIT
