/**
 * The type of the expression at a range of a GROQ query, read in the scope it is written in.
 *
 * groq-js keeps no positions in its syntax tree, so the expression is found by parsing the query
 * twice: as written, and with the expression replaced by a marker. Walking both trees together
 * leads to the marker, and the node at that spot in the first tree is the expression as groq-js
 * reads it, custom functions inlined. The nodes on the way there are the scopes it is read in:
 *
 * - a filter's constraint is read against the elements of the array it filters, as they are
 *   before the filter narrows them, so `_type` in `*[_type == "post"]` is every document type;
 * - a map or a pipe function's arguments are read against each element they apply to, and a
 *   projection against each object, one document type at a time, so the `_type` in
 *   `*[_type == "post"]{_type}` is `"post"`;
 * - a `select()` value and a conditional `condition => {…}` attribute are read only where their
 *   condition may hold, and a `select()` fallback only where no condition surely holds, as
 *   groq-js evaluates them.
 */

import type { ExprNode, SchemaType, SyntaxNode, TypeNode } from 'groq-js'
import { type GroqFunction, withGroqFunctions } from '../content-mapper/functions.js'
import { leadingDefinitions } from '../content-mapper/groq-scanner.js'
import {
  mapElements,
  nested,
  parseQuery,
  ROOT_SCOPE,
  type Scope,
  typeInScope,
  union,
} from './groq-probe.js'

export interface RangeTypeOptions {
  schema: SchemaType
  functions?: Map<string, GroqFunction> | undefined
}

/**
 * A range of a query and how it is marked: an `expression` is replaced by a marker parameter,
 * an `attribute` written without a key, such as `title` in `{title}`, is given a marker key,
 * and a `key` string is replaced by the marker key.
 */
export interface MarkedRange {
  start: number
  end: number
  as: 'expression' | 'attribute' | 'key'
  /**
   * The operand chain an expression starts, when the chain goes on after it, as
   * `*[…].slug.current` does after `*[…].slug`.
   */
  chain?: MarkedRange | undefined
}

const MARKER = '__groqLspHover'

/** The type of the expression `range` marks, or `undefined` when groq-js cannot say. */
export function typeOfRange(
  query: string,
  range: MarkedRange,
  options: RangeTypeOptions
): TypeNode | undefined {
  const prepare = (text: string) =>
    options.functions ? withGroqFunctions(text, options.functions) : text
  const original = parsed(prepare(query))
  if (!original) {
    return undefined
  }

  let types = typesAt(original, prepare(withMarker(query, range)), range.as, (node, scope) =>
    isExpression(node) ? typeInScope(scope, node, options.schema) : undefined
  )
  // Marking only the start of a chain can change how the rest of it parses: `*[…].slug.current`
  // gives each document's `slug.current`, but `$marker.current` reads one attribute. The chain
  // is found instead, and its start read on its own in the chain's scope.
  const { chain } = range
  if (types.length === 0 && chain) {
    const preamble = query.slice(0, leadingDefinitions(query).at(-1)?.end ?? 0)
    const start = parsed(prepare(`${preamble}${query.slice(range.start, range.end)}`))
    if (start) {
      types = typesAt(original, prepare(withMarker(query, chain)), chain.as, (_node, scope) =>
        typeInScope(scope, start, options.schema)
      )
    }
  }
  return types.length > 0 ? union(types) : undefined
}

function parsed(query: string): ExprNode | undefined {
  try {
    return parseQuery(query)
  } catch {
    return undefined
  }
}

/**
 * What `read` makes of each node of `original` the marker in `marked` leads to, in the scope the
 * node is read in. `marked` is the query with a range marked as `as`.
 */
function typesAt(
  original: ExprNode,
  marked: string,
  as: MarkedRange['as'],
  read: (node: SyntaxNode, scope: Scope) => TypeNode | undefined
): Array<TypeNode> {
  const markedRoot = parsed(marked)
  if (!markedRoot) {
    return []
  }
  return markerPaths(original, markedRoot, as === 'expression').flatMap((path) => {
    const found = along(original, path)
    const type = found && read(found.node, found.scope)
    return type ? [type] : []
  })
}

function withMarker(query: string, { start, end, as }: MarkedRange): string {
  switch (as) {
    case 'expression':
      return `${query.slice(0, start)}$${MARKER}${query.slice(end)}`
    case 'attribute':
      return `${query.slice(0, start)}"${MARKER}": ${query.slice(start)}`
    case 'key':
      return `${query.slice(0, start)}"${MARKER}"${query.slice(end)}`
    default:
      return assertNever(as)
  }
}

/** A step from a node to one of the nodes in it: the property, and the index in an array one. */
interface Step {
  key: string
  index?: number
}

/**
 * The paths to every marker in `marked`, which is `original` with one expression marked. A
 * custom function inlines its arguments, so the same argument can be found more than once.
 */
function markerPaths(
  original: SyntaxNode,
  marked: SyntaxNode,
  parameter: boolean,
  path: Array<Step> = [],
  found: Array<Array<Step>> = []
): Array<Array<Step>> {
  if (parameter && marked.type === 'Parameter' && marked.name === MARKER) {
    found.push(path)
    return found
  }
  if (!parameter && marked.type === 'ObjectAttributeValue' && marked.name === MARKER) {
    found.push([...path, { key: 'value' }])
    return found
  }
  if (original.type !== marked.type) {
    return found
  }
  for (const [step, child] of steps(marked)) {
    const counterpart = at(original, step)
    if (counterpart) {
      markerPaths(counterpart, child, parameter, [...path, step], found)
    }
  }
  return found
}

function steps(node: SyntaxNode): Array<[Step, SyntaxNode]> {
  if (node.type === 'Value') {
    return []
  }
  const result: Array<[Step, SyntaxNode]> = []
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        if (isSyntaxNode(item)) {
          result.push([{ key, index }, item])
        }
      })
    } else if (isSyntaxNode(value)) {
      result.push([{ key }, value])
    }
  }
  return result
}

function at(node: SyntaxNode, { key, index }: Step): SyntaxNode | undefined {
  return steps(node).find(([step]) => step.key === key && step.index === index)?.[1]
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/** The node at the end of `path`, and the scope it is read in. */
function along(root: ExprNode, path: Array<Step>): { node: SyntaxNode; scope: Scope } | undefined {
  let scope: Scope = ROOT_SCOPE
  let node: SyntaxNode = root
  for (const [position, step] of path.entries()) {
    scope = scopeOf(node, step, path[position + 1], scope)
    const child = at(node, step)
    if (!child) {
      return undefined
    }
    node = child
  }
  return { node, scope }
}

/** The scope the child of `node` at `step` is read in, inside `scope`, the one `node` is read in. */
function scopeOf(node: SyntaxNode, step: Step, next: Step | undefined, scope: Scope): Scope {
  switch (node.type) {
    case 'Filter':
      return step.key === 'expr' ? nested(scope, (probe) => mapElements(node.base, probe)) : scope
    case 'FlatMap':
    case 'Map':
    case 'Projection':
      return step.key === 'expr' ? nested(scope, (probe) => ({ ...node, expr: probe })) : scope
    case 'ObjectConditionalSplat':
      return step.key === 'value'
        ? nested(scope, (probe) => ({ type: 'Object', attributes: [{ ...node, value: probe }] }))
        : scope
    case 'PipeFuncCall':
      return step.key === 'args' ? nested(scope, (probe) => mapElements(node.base, probe)) : scope
    case 'Select': {
      if (step.key === 'fallback') {
        const unread: ExprNode = { type: 'Value', value: null }
        return nested(scope, (probe) => ({
          type: 'Select',
          alternatives: node.alternatives.map((alternative) => ({ ...alternative, value: unread })),
          fallback: probe,
        }))
      }
      const alternative = step.key === 'alternatives' ? node.alternatives[step.index!] : undefined
      return alternative && next?.key === 'value'
        ? nested(scope, (probe) => ({
            type: 'Select',
            alternatives: [{ ...alternative, value: probe }],
          }))
        : scope
    }
    default:
      return scope
  }
}

function isExpression(node: SyntaxNode): node is ExprNode {
  return (
    node.type !== 'ArrayElement' &&
    node.type !== 'ObjectAttributeValue' &&
    node.type !== 'ObjectConditionalSplat' &&
    node.type !== 'ObjectSplat' &&
    node.type !== 'SelectAlternative'
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled range mark: ${JSON.stringify(value)}`)
}
