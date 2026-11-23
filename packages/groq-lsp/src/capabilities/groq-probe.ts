/**
 * Types of the parts of a GROQ query, each read in the scope it is written in.
 *
 * groq-js types whole queries. A part of one is typed by rebuilding the scopes around it from the
 * query's own syntax tree, a filter, map or projection each wrapped around an object that carries
 * the part, and reading that object back out of the type groq-js evaluates. This is how
 * `@sanity-labs/groq-content-mapper` types what a `$param` is compared with, so a hover and the
 * types the content mapper and `sanity typegen` generate read a query the same way.
 */

import { parse, typeEvaluate } from 'groq-js'
import type { ExprNode, MapNode, ObjectNode, SchemaType, TypeNode } from 'groq-js'

/** The attribute a probe object carries the part of the query it types in. */
const PROBE = '__groqLspProbe'

/**
 * The scopes around a part of a query: `wrap` puts an expression back where the part is, inside
 * `depth` probe objects.
 */
export interface Scope {
  depth: number
  wrap: (expr: ExprNode) => ExprNode
}

export const ROOT_SCOPE: Scope = { depth: 0, wrap: (expr) => expr }

/** A scope inside `scope`: `build` places the probe object where the part is written. */
export function nested(scope: Scope, build: (probe: ObjectNode) => ExprNode): Scope {
  return {
    depth: scope.depth + 1,
    wrap: (expr) =>
      scope.wrap(
        build({
          type: 'Object',
          attributes: [{ type: 'ObjectAttributeValue', name: PROBE, value: expr }],
        })
      ),
  }
}

/** The probe evaluated once per element of `base`, whether the elements are objects or not. */
export function mapElements(base: ExprNode, probe: ExprNode): MapNode {
  return { type: 'Map', base, expr: ownScope(probe) }
}

/**
 * groq-js hides a map's scope from `^`, so a probe that uses `^` projects `@` to get a scope of
 * its own, as a filter or `@{...}` has. That types only object elements, so other probes do not.
 */
export function ownScope(probe: ExprNode): ExprNode {
  return some(probe, (node) => node.type === 'Parent')
    ? { type: 'Projection', base: { type: 'This' }, expr: probe }
    : probe
}

/** The type of `expr` read in `scope`, or `undefined` when groq-js cannot type it there. */
export function typeInScope(
  scope: Scope,
  expr: ExprNode,
  schema: SchemaType
): TypeNode | undefined {
  let evaluated: TypeNode
  try {
    evaluated = typeEvaluate(scope.wrap(expr), schema)
  } catch {
    return undefined
  }
  const types = dig(evaluated, scope.depth)
  return types.length > 0 ? union(types) : undefined
}

/** Reads the probe attribute `depth` levels down, through the arrays and unions on the way. */
function dig(type: TypeNode, depth: number): Array<TypeNode> {
  if (depth === 0) {
    return [type]
  }
  switch (type.type) {
    case 'array':
      return dig(type.of, depth)
    case 'boolean':
    case 'inline':
    case 'null':
    case 'number':
    case 'string':
      return []
    case 'object': {
      const attribute = type.attributes[PROBE]
      return attribute ? dig(attribute.value, depth - 1) : []
    }
    case 'union':
      return type.of.flatMap((member) => dig(member, depth))
    case 'unknown':
      return [type]
    default:
      return assertNever(type)
  }
}

export function members(type: TypeNode): Array<TypeNode> {
  return type.type === 'union' ? type.of.flatMap(members) : [type]
}

export function union(types: Array<TypeNode>): TypeNode {
  const unique = new Map<string, TypeNode>()
  for (const type of types.flatMap(members)) {
    unique.set(JSON.stringify(type), type)
  }
  const of = [...unique.values()]
  const [only] = of
  return only && of.length === 1 ? only : { type: 'union', of }
}

function some(node: ExprNode, predicate: (node: ExprNode) => boolean): boolean {
  return predicate(node) || children(node).some((child) => some(child, predicate))
}

/** The expressions directly inside `node`. */
export function children(node: ExprNode): Array<ExprNode> {
  switch (node.type) {
    case 'AccessAttribute':
      return node.base ? [node.base] : []
    case 'AccessElement':
    case 'ArrayCoerce':
    case 'Asc':
    case 'Deref':
    case 'Desc':
    case 'Group':
    case 'Neg':
    case 'Not':
    case 'Pos':
    case 'Slice':
      return [node.base]
    case 'And':
    case 'OpCall':
    case 'Or':
      return [node.left, node.right]
    case 'Array':
      return node.elements.map((element) => element.value)
    case 'Context':
    case 'Everything':
    case 'Parameter':
    case 'Parent':
    case 'This':
    case 'Value':
      return []
    case 'Filter':
    case 'FlatMap':
    case 'Map':
    case 'Projection':
      return [node.base, node.expr]
    case 'FuncCall':
      return node.args
    case 'InRange':
      return [node.base, node.left, node.right]
    case 'Object':
      return node.attributes.flatMap((attribute) =>
        attribute.type === 'ObjectConditionalSplat'
          ? [attribute.condition, attribute.value]
          : [attribute.value]
      )
    case 'PipeFuncCall':
      return [node.base, ...node.args]
    case 'Select':
      return [
        ...node.alternatives.flatMap((alternative) => [alternative.condition, alternative.value]),
        ...(node.fallback ? [node.fallback] : []),
      ]
    case 'SelectorFuncCall':
      return [node.arg]
    case 'SelectorNested':
      return [node.base, node.nested]
    case 'Tuple':
      return node.members
    default:
      return assertNever(node)
  }
}

/**
 * Parse a query whose slices may be bounded by parameters, as `[0...$limit]`. groq-js only
 * parses constant bounds, so those parameters are bound to `0`, which does not change any type.
 */
export function parseQuery(query: string): ExprNode {
  const params: Record<string, number> = {}
  for (const name of sliceParams(query)) {
    params[name] = 0
  }
  return parse(query, { params })
}

const PARAMETER = /\$([A-Za-z_]\w*)/g

/** The bracket a closing one closes, or `undefined` when `char` closes none. */
function openerOf(char: string): string | undefined {
  switch (char) {
    case ')':
      return '('
    case ']':
      return '['
    case '}':
      return '{'
    default:
      return undefined
  }
}

/** The names of the parameters used as slice bounds in `query`, in order of first use. */
export function sliceParams(query: string): Array<string> {
  const names = new Set<string>()
  for (const bounds of sliceBounds(withoutLiterals(query))) {
    for (const [, name] of bounds.matchAll(PARAMETER)) {
      if (name !== undefined) {
        names.add(name)
      }
    }
  }
  return [...names]
}

/** The text between the brackets of each `[a..b]` or `[a...b]` slice, not an array or a filter. */
function sliceBounds(code: string): Array<string> {
  interface Open {
    char: string
    start: number
    range?: number
    notSlice: boolean
  }
  const bounds: Array<string> = []
  const stack: Array<Open> = []
  for (let index = 0; index < code.length; index++) {
    const char = code.charAt(index)
    const top = stack.at(-1)
    const opener = openerOf(char)
    if (char === '(' || char === '[' || char === '{') {
      stack.push({ char, start: index, notSlice: false })
    } else if (opener) {
      if (!top || top.char !== opener) {
        continue
      }
      stack.pop()
      if (
        char === ']' &&
        !top.notSlice &&
        top.range !== undefined &&
        code.slice(top.start + 1, top.range).trim().length > 0
      ) {
        bounds.push(code.slice(top.start + 1, index))
      }
    } else if (char === '.' && code.charAt(index + 1) === '.') {
      if (top?.char === '[' && top.range === undefined) {
        top.range = index
      }
      while (code.charAt(index + 1) === '.') {
        index++
      }
    } else if (char === ',') {
      if (top && top.range === undefined) {
        top.notSlice = true
      }
    } else if (/[A-Za-z_$]/.test(char)) {
      let end = index
      while (end + 1 < code.length && /\w/.test(code.charAt(end + 1))) {
        end++
      }
      if (top && top.range === undefined && code.slice(index, end + 1) === 'in') {
        top.notSlice = true
      }
      index = end
    }
  }
  return bounds
}

/**
 * The query with the contents of string literals and comments blanked out, at the same positions,
 * so nothing in them is read as code.
 */
export function withoutLiterals(query: string): string {
  let code = ''
  let quote: string | undefined
  for (let index = 0; index < query.length; index++) {
    const char = query.charAt(index)
    if (quote) {
      if (char === '\\') {
        code += '  '
        index++
      } else if (char === quote) {
        quote = undefined
        code += char
      } else {
        code += char === '\n' ? '\n' : ' '
      }
    } else if (char === '"' || char === "'") {
      quote = char
      code += char
    } else if (char === '/' && query.charAt(index + 1) === '/') {
      const end = query.indexOf('\n', index)
      const length = (end === -1 ? query.length : end) - index
      code += ' '.repeat(length)
      index += length - 1
    } else {
      code += char
    }
  }
  return code
}

function assertNever(value: never): never {
  throw new Error(`Unhandled GROQ node or type: ${JSON.stringify(value)}`)
}
