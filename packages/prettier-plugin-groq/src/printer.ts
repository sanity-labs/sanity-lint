import type { AstPath, Doc, Printer, doc } from 'prettier'
import type { ExprNode } from 'groq-js'
import type { GroqAst } from './parser.js'

type Builders = typeof doc.builders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrintFn = (path: AstPath<any>) => Doc

// Note: groq-js TypeScript types are incomplete - many node types exist at runtime
// but aren't in the type definitions (ObjectSplat, Range, SelectAlternative, etc.)
// We use 'any' here to handle all runtime node types correctly.
function createPrintNode(builders: Builders) {
  const { group, indent, join, line, softline } = builders

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function printNode(node: any, print: PrintFn, path: AstPath<any>): Doc {
    switch (node.type) {
      case 'Everything':
        return '*'

      case 'This':
        return '@'

      case 'Parent':
        return '^'

      case 'Value':
        return printValue(node.value)

      case 'Parameter':
        return `$${node.name}`

      case 'AccessAttribute':
        if (node.base) {
          const base = path.call((p) => printNode(p.node, print, p), 'base')
          // Don't add dot after dereference
          if (isDerefNode(node.base)) {
            return [base, node.name]
          }
          return [base, '.', node.name]
        }
        return node.name

      case 'AccessElement':
        return [
          path.call((p) => printNode(p.node, print, p), 'base'),
          '[',
          path.call((p) => printNode(p.node, print, p), 'index'),
          ']',
        ]

      case 'Filter':
        return [
          path.call((p) => printNode(p.node, print, p), 'base'),
          group([
            '[',
            indent([softline, path.call((p) => printNode(p.node, print, p), 'expr')]),
            softline,
            ']',
          ]),
        ]

      case 'Slice':
        return [
          path.call((p) => printNode(p.node, print, p), 'base'),
          '[',
          String(node.left),
          node.isInclusive ? '..' : '...',
          String(node.right),
          ']',
        ]

      case 'Map': {
        const base = path.call((p) => printNode(p.node, print, p), 'base')
        const expr = path.call((p) => printNode(p.node, print, p), 'expr')
        // Special case: when base is ArrayCoerce and expr starts with Deref(This),
        // collapse to the common `field[]->{ ... }` notation instead of `field[] @->{ ... }`
        if (node.base.type === 'ArrayCoerce' && isDerefOfThis(node.expr)) {
          // No space needed - the expr will start with ->
          return [base, expr]
        }
        return [base, ' ', expr]
      }

      case 'Projection': {
        const base = path.call((p) => printNode(p.node, print, p), 'base')
        const expr = path.call((p) => printNode(p.node, print, p), 'expr')
        // If base is This (@), omit it
        if (node.base.type === 'This') {
          return expr
        }
        // No space after dereference (author->{ name } not author-> { name })
        if (node.base.type === 'Deref') {
          return [base, expr]
        }
        return [base, ' ', expr]
      }

      case 'Object': {
        if (node.attributes.length === 0) {
          return '{}'
        }
        const attrs = path.map((p) => printNode(p.node, print, p), 'attributes')
        return group(['{', indent([line, join([',', line], attrs)]), line, '}'])
      }

      case 'ObjectAttributeValue': {
        const value = path.call((p) => printNode(p.node, print, p), 'value')
        // Check if we can use shorthand (omit the key entirely)
        // Shorthand is valid when the leading attribute name matches the key
        // e.g., { title } for { "title": title }
        // e.g., { author->{ name } } for { "author": author->{ name } }
        // e.g., { categories[]->{ title } } for { "categories": categories[]->{ title } }
        const leadingAttr = getLeadingAttribute(node.value)
        if (leadingAttr === node.name) {
          return value
        }
        // For all other cases, we MUST quote the key in GROQ
        // e.g., { "slug": slug.current } not { slug: slug.current }
        return ['"', escapeString(node.name), '": ', value]
      }

      case 'ObjectSplat':
        if (node.value) {
          return ['...', path.call((p) => printNode(p.node, print, p), 'value')]
        }
        return '...'

      case 'ObjectConditionalSplat':
        return [
          '...',
          path.call((p) => printNode(p.node, print, p), 'condition'),
          ' => ',
          path.call((p) => printNode(p.node, print, p), 'value'),
        ]

      case 'Array': {
        if (node.elements.length === 0) {
          return '[]'
        }
        const elems = path.map((p) => printNode(p.node, print, p), 'elements')
        return group(['[', indent([softline, join([',', line], elems)]), softline, ']'])
      }

      case 'ArrayElement':
        if (node.isSplat) {
          return ['...', path.call((p) => printNode(p.node, print, p), 'value')]
        }
        return path.call((p) => printNode(p.node, print, p), 'value')

      case 'Tuple': {
        const members = path.map((p) => printNode(p.node, print, p), 'members')
        return ['(', join([',', ' '], members), ')']
      }

      case 'Range':
        return [
          path.call((p) => printNode(p.node, print, p), 'left'),
          node.isInclusive ? '..' : '...',
          path.call((p) => printNode(p.node, print, p), 'right'),
        ]

      case 'And':
        return group([
          path.call((p) => printNode(p.node, print, p), 'left'),
          indent([line, '&& ', path.call((p) => printNode(p.node, print, p), 'right')]),
        ])

      case 'Or':
        return group([
          path.call((p) => printNode(p.node, print, p), 'left'),
          indent([line, '|| ', path.call((p) => printNode(p.node, print, p), 'right')]),
        ])

      case 'Not':
        return ['!', path.call((p) => printNode(p.node, print, p), 'base')]

      case 'Neg':
        return ['-', path.call((p) => printNode(p.node, print, p), 'base')]

      case 'Pos':
        return ['+', path.call((p) => printNode(p.node, print, p), 'base')]

      case 'OpCall': {
        const left = path.call((p) => printNode(p.node, print, p), 'left')
        const right = path.call((p) => printNode(p.node, print, p), 'right')
        return [left, ` ${node.op} `, right]
      }

      case 'FuncCall': {
        const name =
          node.namespace && node.namespace !== 'global'
            ? `${node.namespace}::${node.name}`
            : node.name
        if (node.args.length === 0) {
          return `${name}()`
        }
        const args = path.map((p) => printNode(p.node, print, p), 'args')
        return group([name, '(', indent([softline, join([',', line], args)]), softline, ')'])
      }

      case 'PipeFuncCall': {
        const base = path.call((p) => printNode(p.node, print, p), 'base')
        const name =
          node.namespace && node.namespace !== 'global'
            ? `${node.namespace}::${node.name}`
            : node.name
        const args = path.map((p) => printNode(p.node, print, p), 'args')
        const argsDoc = args.length === 0 ? '' : group(['(', join([', '], args), ')'])
        return group([base, indent([line, '| ', name, argsDoc])])
      }

      case 'Deref': {
        // When base is This (@), omit it - this is the implicit dereference in array traversals
        // e.g., categories[]->{ title } should not become categories[] @->{ title }
        if (node.base.type === 'This') {
          return '->'
        }
        const base = path.call((p) => printNode(p.node, print, p), 'base')
        return [base, '->']
      }

      case 'Asc':
        return [path.call((p) => printNode(p.node, print, p), 'base'), ' asc']

      case 'Desc':
        return [path.call((p) => printNode(p.node, print, p), 'base'), ' desc']

      case 'Group':
        return ['(', path.call((p) => printNode(p.node, print, p), 'base'), ')']

      case 'ArrayCoerce':
        return [path.call((p) => printNode(p.node, print, p), 'base'), '[]']

      case 'FlatMap':
        return [
          path.call((p) => printNode(p.node, print, p), 'base'),
          '[]',
          path.call((p) => printNode(p.node, print, p), 'expr'),
        ]

      case 'Select': {
        const alternatives = path.map((p) => printNode(p.node, print, p), 'alternatives')
        const fallback = node.fallback
          ? path.call((p) => printNode(p.node, print, p), 'fallback')
          : null
        const allArgs = fallback ? [...alternatives, fallback] : alternatives
        return group(['select(', indent([softline, join([',', line], allArgs)]), softline, ')'])
      }

      case 'SelectAlternative':
        return [
          path.call((p) => printNode(p.node, print, p), 'condition'),
          ' => ',
          path.call((p) => printNode(p.node, print, p), 'value'),
        ]

      case 'InRange':
        return [
          path.call((p) => printNode(p.node, print, p), 'base'),
          ' in ',
          path.call((p) => printNode(p.node, print, p), 'range'),
        ]

      case 'Context':
        // Internal node, shouldn't appear in user queries
        return path.call((p) => printNode(p.node, print, p), 'base')

      default:
        // Fallback for any unhandled node types
        throw new Error(`Unknown GROQ node type: ${(node as { type: string }).type}`)
    }
  }
}

function printValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return `"${escapeString(value)}"`
  }
  if (typeof value === 'number') {
    return formatNumber(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  // Arrays and objects shouldn't appear as raw values
  return String(value)
}

function escapeString(s: string): string {
  let result = ''
  for (const ch of s) {
    switch (ch) {
      case '"':
        result += '\\"'
        break
      case '\\':
        result += '\\\\'
        break
      case '\n':
        result += '\\n'
        break
      case '\r':
        result += '\\r'
        break
      case '\t':
        result += '\\t'
        break
      default:
        if (ch.charCodeAt(0) < 32) {
          result += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
        } else {
          result += ch
        }
    }
  }
  return result
}

function formatNumber(value: number): string {
  return String(value)
}

function isDerefNode(node: ExprNode): boolean {
  return node.type === 'Deref'
}

/**
 * Check if a node represents a Deref of This (@->)
 * This handles both direct Deref(This) and Projection with Deref(This) as base
 */
function isDerefOfThis(node: ExprNode): boolean {
  if (node.type === 'Deref' && node.base.type === 'This') {
    return true
  }
  if (node.type === 'Projection' && node.base.type === 'Deref' && node.base.base.type === 'This') {
    return true
  }
  return false
}

/**
 * Get the attribute name that can be used for shorthand in projections.
 * Returns the name only when shorthand is valid in GROQ.
 *
 * Valid shorthand cases:
 * - { title } → simple attribute access
 * - { author->{ name } } → dereference of attribute
 * - { categories[]->{ title } } → array traversal of attribute
 *
 * Invalid shorthand (returns null):
 * - { slug.current } → dot access (GROQ can't infer key)
 */
function getLeadingAttribute(node: ExprNode): string | null {
  switch (node.type) {
    case 'AccessAttribute':
      // Only valid for shorthand if there's NO base (simple attribute)
      // { title } is valid, but { slug.current } is NOT
      if (!node.base) {
        return node.name
      }
      // Dot access - shorthand not valid
      return null
    case 'Deref':
      // { author->{ name } } - check if base is a simple attribute
      return getLeadingAttribute(node.base)
    case 'Projection':
      // Projection's base determines the leading attribute
      return getLeadingAttribute(node.base)
    case 'ArrayCoerce':
      // { tags[] } - check if base is a simple attribute
      return getLeadingAttribute(node.base)
    case 'Map':
      // Map's base determines the leading attribute
      return getLeadingAttribute(node.base)
    default:
      return null
  }
}

export function createGroqPrinter(builders: Builders): Printer<GroqAst | ExprNode> {
  const printNode = createPrintNode(builders)

  return {
    print(path, options, print) {
      const node = path.node

      // Handle root wrapper
      if ('type' in node && node.type === 'groq-root') {
        return path.call(
          (p) => printNode(p.node as ExprNode, print as PrintFn, p as AstPath<ExprNode>),
          'node'
        )
      }

      // Handle ExprNode
      return printNode(node as ExprNode, print as PrintFn, path as AstPath<ExprNode>)
    },
  }
}
