/**
 * The types of the `$params` of a GROQ query, as `@sanity-labs/groq-content-mapper` infers them
 * for the `QueryParams` it generates.
 *
 * A parameter has no declared type, so it takes the type of what the query compares it with:
 * `slug.current == $slug` makes it `string`, `role == $role` keeps a string enum, `$tag in tags`
 * is an element of `tags` and `_id in $ids` an array of `_id`, `title match $term` is `string`,
 * and a slice bound is `number`. The compared value is read in the scope it is written in, so a
 * filter, a dereference or a `^` resolves as it does for the result type, and `null` is left out:
 * a parameter is a value that is given. Compared with a literal, the parameter widens to the
 * literal's primitive. A parameter nothing compares is `unknown`.
 */

import type {
  ExprNode,
  InRangeNode,
  OpCallNode,
  ParameterNode,
  SchemaType,
  TypeNode,
} from 'groq-js'
import {
  children,
  mapElements,
  members,
  nested,
  ownScope,
  parseQuery,
  ROOT_SCOPE,
  type Scope,
  sliceParams,
  typeInScope,
  union,
  withoutLiterals,
} from './groq-probe.js'

interface Comparison {
  name: string
  counterpart: ExprNode
  op: OpCallNode['op'] | 'range'
  paramOnLeft: boolean
  scope: Scope
}

interface Found {
  comparisons: Array<Comparison>
  names: Set<string>
}

const UNKNOWN: TypeNode = { type: 'unknown' }
const PARAMETER = /\$([A-Za-z_]\w*)/g

/**
 * The type of every `$param` in `query`, in order of first use. `query` includes the custom
 * functions it calls. Throws when groq-js cannot parse `query`.
 */
export function inferParamTypes(query: string, schema: SchemaType): Map<string, TypeNode> {
  const found: Found = { comparisons: [], names: new Set() }
  walk(parseQuery(query), ROOT_SCOPE, found)

  const types = new Map<string, Array<TypeNode>>()
  for (const name of sliceParams(query)) {
    types.set(name, [{ type: 'number' }])
  }
  for (const name of found.names) {
    types.set(name, types.get(name) ?? [])
  }
  for (const comparison of found.comparisons) {
    const type = resolve(comparison, schema)
    if (type) {
      types.get(comparison.name)?.push(type)
    }
  }

  const params = new Map<string, TypeNode>()
  const inOrder = [...withoutLiterals(query).matchAll(PARAMETER)].map((match) => match[1]!)
  for (const name of [...inOrder, ...types.keys()]) {
    const candidates = types.get(name)
    if (candidates && !params.has(name)) {
      params.set(name, combine(candidates))
    }
  }
  return params
}

function walk(node: ExprNode, scope: Scope, found: Found): void {
  switch (node.type) {
    case 'Filter':
      walk(node.base, scope, found)
      walk(
        node.expr,
        nested(scope, (probe) => mapElements(node, probe)),
        found
      )
      return
    case 'FlatMap':
    case 'Map': {
      walk(node.base, scope, found)
      const projects = node.expr.type === 'Projection' && node.expr.base.type === 'This'
      walk(
        node.expr,
        nested(scope, (probe) => ({ ...node, expr: projects ? ownScope(probe) : probe })),
        found
      )
      return
    }
    case 'InRange':
      noteRange(node, scope, found)
      break
    case 'OpCall':
      noteComparison(node, scope, found)
      break
    case 'Parameter':
      found.names.add(node.name)
      return
    case 'PipeFuncCall': {
      walk(node.base, scope, found)
      const inner = nested(scope, (probe) => mapElements(node.base, probe))
      for (const arg of node.args) {
        walk(arg, inner, found)
      }
      return
    }
    case 'Projection': {
      walk(node.base, scope, found)
      const inner =
        node.base.type === 'This' ? scope : nested(scope, (probe) => ({ ...node, expr: probe }))
      walk(node.expr, inner, found)
      return
    }
    default:
      break
  }
  for (const child of children(node)) {
    walk(child, scope, found)
  }
}

function noteComparison(node: OpCallNode, scope: Scope, found: Found): void {
  const left = asParameter(node.left)
  const right = asParameter(node.right)
  if (!left === !right) {
    return
  }
  found.comparisons.push({
    name: (left ?? right)!.name,
    counterpart: left ? node.right : node.left,
    op: node.op,
    paramOnLeft: Boolean(left),
    scope,
  })
}

function noteRange(node: InRangeNode, scope: Scope, found: Found): void {
  for (const bound of [node.left, node.right]) {
    const param = asParameter(bound)
    if (param) {
      found.comparisons.push({
        name: param.name,
        counterpart: node.base,
        op: 'range',
        paramOnLeft: true,
        scope,
      })
    }
  }
}

function asParameter(node: ExprNode): ParameterNode | undefined {
  if (node.type === 'Group') {
    return asParameter(node.base)
  }
  return node.type === 'Parameter' ? node : undefined
}

function resolve(
  { counterpart, op, paramOnLeft, scope }: Comparison,
  schema: SchemaType
): TypeNode | undefined {
  if (op === 'match') {
    return { type: 'string' }
  }
  const expr = unwrapGroups(counterpart)
  const probed = typeInScope(scope, expr, schema)
  if (!probed) {
    return undefined
  }
  const type = expr.type === 'Value' ? widen(probed) : withoutNull(probed)
  if (type.type === 'null' && expr.type !== 'Value') {
    return undefined
  }
  if (op !== 'in') {
    return type
  }
  return paramOnLeft ? withoutNull(elementOf(type)) : { type: 'array', of: type }
}

/** One type per parameter: the union of what its comparisons say, or `unknown` if nothing does. */
function combine(types: Array<TypeNode>): TypeNode {
  const known = types.flatMap(members).filter((type) => type.type !== 'unknown')
  return known.length > 0 ? union(known) : UNKNOWN
}

function withoutNull(type: TypeNode): TypeNode {
  const of = members(type).filter((member) => member.type !== 'null')
  return of.length > 0 ? union(of) : type
}

function elementOf(type: TypeNode): TypeNode {
  return union(members(type).map((member) => (member.type === 'array' ? member.of : member)))
}

function widen(type: TypeNode): TypeNode {
  return union(
    members(type).map((member) =>
      member.type === 'string' || member.type === 'number' || member.type === 'boolean'
        ? { type: member.type }
        : member
    )
  )
}

function unwrapGroups(node: ExprNode): ExprNode {
  return node.type === 'Group' ? unwrapGroups(node.base) : node
}
