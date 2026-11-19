/**
 * Schema-aware types for hovering over fields in a GROQ query
 *
 * Resolves the identifier under the cursor against the schema, in the scope it is written in, so a
 * field hovers as the type the schema gives it rather than the type of the whole query. A `_type`
 * in a filter hovers as the document type names the filter selects.
 */

import {
  parse,
  typeEvaluate,
  type ExprNode,
  type ObjectTypeNode,
  type SchemaType,
  type TypeNode,
} from 'groq-js'
import { type GroqFunction, withGroqFunctions } from '../content-mapper/functions.js'
import { leadingDefinitions } from '../content-mapper/groq-scanner.js'

export interface FieldTypeOptions {
  schema: SchemaType
  functions?: Map<string, GroqFunction> | undefined
}

const SCOPE_KEY = '__scope'
const MAX_OBJECT_ATTRIBUTES = 4

interface Frame {
  open: number
  bracket: '[' | '{'
}

/**
 * Describe the type of the identifier at `position`, or `null` when the schema does not say.
 */
export function resolveFieldType(
  query: string,
  position: number,
  options: FieldTypeOptions
): string | null {
  const masked = maskStrings(query)
  const word = wordAt(masked, position)
  if (!word || isInString(query, masked, word.start) || !isFieldReference(masked, word)) {
    return null
  }

  const frames = enclosingFrames(masked, word.start)
  const filter = frames.at(-1)
  if (word.text === '_type' && filter?.bracket === '[' && !hasMemberPrefix(masked, word.start)) {
    const names = typeNamesInFilter(query, masked, filter, options)
    if (names) {
      return names.join(' | ')
    }
  }

  const base = memberBaseStart(masked, word.start)
  const prefix =
    base === undefined
      ? '@'
      : query.slice(base, word.start - (masked.charAt(word.start - 1) === '.' ? 1 : 0))
  const scopeTypes = scopeTypesAt(query, masked, frames, prefix, options)
  if (!scopeTypes) {
    return null
  }

  const found: Array<TypeNode> = []
  for (const object of flatten(scopeTypes, options.schema).filter(isObject)) {
    const attribute = object.attributes[word.text]
    if (attribute) {
      found.push(...unionMembers(attribute.value).filter((member) => member.type !== 'null'))
    }
  }

  const formatted = unique(found.map((type) => formatSchemaType(type, word.text === '_type')))
  return formatted.length > 0 ? formatted.join(' | ') : null
}

export interface CallType {
  /** `namespace::name`. */
  name: string
  type: string
}

const NAMESPACED_CALL = /([A-Za-z_]\w*)\s*::\s*([A-Za-z_]\w*)\s*\(/g

/**
 * Describe what the custom function call under `position` returns, or `null` when `position` is
 * not on the name or the parentheses of a call to a function the query defines or `functions`
 * holds, or the schema does not say. The arguments of the call are left to
 * {@link resolveFieldType}.
 */
export function resolveCallType(
  query: string,
  position: number,
  options: FieldTypeOptions
): CallType | null {
  const masked = maskStrings(query)
  const definitions = leadingDefinitions(query)
  const defined = new Set(definitions.map((definition) => definition.name))
  const preamble = query.slice(0, definitions.at(-1)?.end ?? 0)

  let hovered: { name: string; start: number; close: number } | undefined
  for (const match of masked.matchAll(NAMESPACED_CALL)) {
    const name = `${match[1]}::${match[2]}`
    const open = match.index + match[0].length - 1
    const close = matchingClose(masked, open)
    if (
      close === undefined ||
      match.index < preamble.length ||
      /\bfn\s*$/.test(masked.slice(0, match.index)) ||
      !(defined.has(name) || options.functions?.has(name))
    ) {
      continue
    }
    if ((position >= match.index && position <= open) || position === close) {
      hovered = { name, start: match.index, close }
      break
    }
  }
  if (!hovered) {
    return null
  }

  const call = query.slice(hovered.start, hovered.close + 1)
  const frames = enclosingFrames(masked, hovered.start)
  const type = scopeTypesAt(query, masked, frames, call, options, preamble)
  if (!type) {
    return null
  }
  const members = unionMembers(type)
  const present = members.filter((member) => member.type !== 'null')
  const formatted = unique(
    (present.length > 0 ? present : members).map((member) => formatSchemaType(member, false))
  ).join(' | ')
  return formatted ? { name: hovered.name, type: formatted } : null
}

interface Word {
  text: string
  start: number
  end: number
}

function wordAt(text: string, position: number): Word | null {
  let start = position
  let end = position
  while (start > 0 && isIdentifierChar(text[start - 1])) {
    start--
  }
  while (end < text.length && isIdentifierChar(text[end])) {
    end++
  }
  const word = text.slice(start, end)
  if (!word || /^\d/.test(word)) {
    return null
  }
  return { text: word, start, end }
}

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[a-zA-Z0-9_]/.test(char)
}

/**
 * Replace the contents of string literals with spaces so brackets in them are not counted.
 */
function maskStrings(text: string): string {
  let result = ''
  let quote: string | undefined
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index)
    if (quote) {
      if (char === '\\') {
        result += '  '
        index++
      } else if (char === quote) {
        quote = undefined
        result += char
      } else {
        result += ' '
      }
    } else {
      if (char === '"' || char === "'") {
        quote = char
      }
      result += char
    }
  }
  return result
}

function isInString(text: string, masked: string, index: number): boolean {
  return text.charAt(index) !== masked.charAt(index)
}

/**
 * Whether the word names a field: not a parameter, namespaced function, function call or keyword.
 */
function isFieldReference(masked: string, word: Word): boolean {
  const before = masked.slice(0, word.start).trimEnd()
  const after = masked.slice(word.end).trimStart()
  if (
    before.endsWith('$') ||
    before.endsWith('::') ||
    before.endsWith('@') ||
    before.endsWith('^')
  ) {
    return false
  }
  if (after.startsWith('(') || after.startsWith('::')) {
    return false
  }
  return !['true', 'false', 'null', 'in', 'match', 'asc', 'desc'].includes(word.text)
}

/**
 * The `[` and `{` that are open at `position`, outermost first. Parentheses are skipped: they
 * group or call, and do not change what an identifier refers to.
 */
function enclosingFrames(masked: string, position: number): Array<Frame> {
  const stack: Array<{ char: string; index: number }> = []
  for (let index = 0; index < position; index++) {
    const char = masked.charAt(index)
    if (char === '[' || char === '{' || char === '(') {
      stack.push({ char, index })
    } else if (char === ']' || char === '}' || char === ')') {
      stack.pop()
    }
  }
  const frames: Array<Frame> = []
  for (const { char, index } of stack) {
    if (char === '[' || char === '{') {
      frames.push({ open: index, bracket: char })
    }
  }
  return frames
}

function matchingClose(masked: string, open: number): number | undefined {
  let depth = 0
  for (let index = open; index < masked.length; index++) {
    const char = masked.charAt(index)
    if (char === '[' || char === '{' || char === '(') {
      depth++
    } else if (char === ']' || char === '}' || char === ')') {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return undefined
}

function matchingOpen(masked: string, close: number): number | undefined {
  let depth = 0
  for (let index = close; index >= 0; index--) {
    const char = masked.charAt(index)
    if (char === ']' || char === '}' || char === ')') {
      depth++
    } else if (char === '[' || char === '{' || char === '(') {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return undefined
}

/**
 * Start of the postfix expression that ends right before `end` (such as `*[_type == "page"][0]`
 * or `authors[]->`), or `undefined` when nothing precedes it.
 */
function postfixStart(masked: string, end: number): number | undefined {
  end = trimmedEnd(masked, end)
  let start = end
  while (start > 0) {
    const char = masked.charAt(start - 1)
    if (char === ']' || char === ')') {
      const open = matchingOpen(masked, start - 1)
      if (open === undefined) {
        break
      }
      start = open
    } else if (isIdentifierChar(char) || char === '*') {
      while (
        start > 0 &&
        (isIdentifierChar(masked.charAt(start - 1)) || masked.charAt(start - 1) === '*')
      ) {
        start--
      }
      const previous = masked.charAt(start - 1)
      if (previous !== '.' && !(previous === '>' && masked.charAt(start - 2) === '-')) {
        break
      }
    } else if (char === '>' && masked.charAt(start - 2) === '-') {
      start -= 2
    } else if (char === '.') {
      start--
    } else {
      break
    }
  }
  return start < end ? start : undefined
}

function trimmedEnd(masked: string, end: number): number {
  while (end > 0 && /\s/.test(masked.charAt(end - 1))) {
    end--
  }
  return end
}

function connectorLength(masked: string, wordStart: number): number {
  return masked.charAt(wordStart - 1) === '.' ? 1 : 2
}

function hasMemberPrefix(masked: string, wordStart: number): boolean {
  return (
    masked.charAt(wordStart - 1) === '.' ||
    (masked.charAt(wordStart - 1) === '>' && masked.charAt(wordStart - 2) === '-')
  )
}

/**
 * Start of the expression whose attribute the word names (`slug` in `slug.current`).
 */
function memberBaseStart(masked: string, wordStart: number): number | undefined {
  if (!hasMemberPrefix(masked, wordStart)) {
    return undefined
  }
  return postfixStart(masked, wordStart - connectorLength(masked, wordStart))
}

function parseQuery(text: string, options: FieldTypeOptions): ExprNode {
  return parse(options.functions ? withGroqFunctions(text, options.functions) : text)
}

/**
 * Evaluate `prefix` as it is seen from inside the open frames. Each projection or filter is
 * rebuilt around a single attribute that carries the next level, so groq-js evaluates every
 * base in the scope of the one enclosing it.
 */
function scopeTypesAt(
  query: string,
  masked: string,
  frames: Array<Frame>,
  prefix: string,
  options: FieldTypeOptions,
  preamble = ''
): TypeNode | undefined {
  const bases: Array<string> = []
  for (const frame of frames) {
    const start = postfixStart(masked, frame.open)
    if (start !== undefined) {
      bases.push(query.slice(start, trimmedEnd(masked, frame.open)))
    }
  }

  if (bases.length === 0 && prefix === '@') {
    return undefined
  }

  const body = bases.reduceRight((inner, base) => `${base}{"${SCOPE_KEY}": ${inner}}`, prefix)
  const composed = preamble ? `${preamble}\n${body}` : body

  try {
    let type: TypeNode = typeEvaluate(parseQuery(composed, options), options.schema)
    for (let level = 0; level < bases.length; level++) {
      const next: Array<TypeNode> = []
      for (const object of flatten(type, options.schema).filter(isObject)) {
        const attribute = object.attributes[SCOPE_KEY]
        if (attribute) {
          next.push(attribute.value)
        }
      }
      type = { type: 'union', of: next }
    }
    return type
  } catch {
    return undefined
  }
}

function isObject(type: TypeNode): type is ObjectTypeNode {
  return type.type === 'object'
}

/**
 * Flatten arrays, unions and named types into the types they may be at a single value.
 */
function flatten(type: TypeNode, schema: SchemaType, seen = new Set<string>()): Array<TypeNode> {
  switch (type.type) {
    case 'union':
      return type.of.flatMap((member) => flatten(member, schema, seen))
    case 'array':
      return flatten(type.of, schema, seen)
    case 'inline': {
      if (seen.has(type.name)) {
        return []
      }
      const declaration = schema.find((entry) => entry.name === type.name)
      if (declaration?.type === 'type') {
        return flatten(declaration.value, schema, new Set(seen).add(type.name))
      }
      if (declaration?.type === 'document') {
        return [{ type: 'object', attributes: declaration.attributes }]
      }
      return []
    }
    case 'object':
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'unknown':
      return [type]
    default:
      return assertNever(type)
  }
}

function unionMembers(type: TypeNode): Array<TypeNode> {
  return type.type === 'union' ? type.of.flatMap(unionMembers) : [type]
}

function assertNever(value: never): never {
  throw new Error(`Unhandled type: ${JSON.stringify(value)}`)
}

function unique(values: Array<string>): Array<string> {
  return [...new Set(values)]
}

/**
 * Format a schema type for display. Literal strings keep their quotes unless they are type names.
 */
function formatSchemaType(type: TypeNode, bareLiterals: boolean, depth = 0): string {
  switch (type.type) {
    case 'null':
    case 'boolean':
    case 'number':
    case 'unknown':
      return type.type
    case 'string':
      if (type.value === undefined) {
        return 'string'
      }
      return bareLiterals ? type.value : `"${type.value}"`
    case 'array':
      return `array<${formatSchemaType(type.of, false, depth + 1)}>`
    case 'inline':
      return type.name
    case 'union':
      return unique(
        unionMembers(type)
          .filter((member) => member.type !== 'null')
          .map((member) => formatSchemaType(member, bareLiterals, depth + 1))
      ).join(' | ')
    case 'object': {
      const entries = Object.entries(type.attributes)
      if (depth > 0 || entries.length === 0 || entries.length > MAX_OBJECT_ATTRIBUTES) {
        return 'object'
      }
      const fields = entries.map(
        ([name, attribute]) => `${name}: ${formatSchemaType(attribute.value, false, depth + 1)}`
      )
      return `{ ${fields.join(', ')} }`
    }
    default:
      return assertNever(type)
  }
}

/**
 * The document type names a filter selects, when it constrains `_type` and every name is a
 * type the schema defines.
 */
function typeNamesInFilter(
  query: string,
  masked: string,
  frame: Frame,
  options: FieldTypeOptions
): Array<string> | null {
  if (postfixStart(masked, frame.open) === undefined) {
    return null
  }
  const close = matchingClose(masked, frame.open) ?? masked.length
  let filter: ExprNode
  try {
    filter = parseQuery(query.slice(frame.open + 1, close), options)
  } catch {
    return null
  }

  const names = typeNamesOf(filter)
  if (!names || names.length === 0) {
    return null
  }
  const defined = new Set(options.schema.map((entry) => entry.name))
  return names.every((name) => defined.has(name)) ? names : null
}

function typeNamesOf(node: ExprNode): Array<string> | null {
  switch (node.type) {
    case 'Group':
      return typeNamesOf(node.base)
    case 'And': {
      const left = typeNamesOf(node.left)
      const right = typeNamesOf(node.right)
      if (left && right) {
        return left.filter((name) => right.includes(name))
      }
      return left ?? right
    }
    case 'Or': {
      const left = typeNamesOf(node.left)
      const right = typeNamesOf(node.right)
      return left && right ? unique([...left, ...right]) : null
    }
    case 'OpCall':
      return typeNamesOfComparison(node)
    default:
      return null
  }
}

function typeNamesOfComparison(node: Extract<ExprNode, { type: 'OpCall' }>): Array<string> | null {
  const { op, left, right } = node
  if (op === '==') {
    const sides = isTypeAccess(left) ? right : isTypeAccess(right) ? left : undefined
    return sides?.type === 'Value' && typeof sides.value === 'string' ? [sides.value] : null
  }
  if (op === 'in' && isTypeAccess(left) && right.type === 'Array') {
    const names: Array<string> = []
    for (const element of right.elements) {
      if (
        element.isSplat ||
        element.value.type !== 'Value' ||
        typeof element.value.value !== 'string'
      ) {
        return null
      }
      names.push(element.value.value)
    }
    return names
  }
  return null
}

function isTypeAccess(node: ExprNode): boolean {
  return node.type === 'AccessAttribute' && node.name === '_type' && !node.base
}
