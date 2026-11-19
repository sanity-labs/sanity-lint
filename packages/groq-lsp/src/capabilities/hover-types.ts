/**
 * Schema-aware types for hovering over fields in a GROQ query
 *
 * Resolves the identifier under the cursor against the schema, in the scope it is written in, so a
 * field hovers as the type the schema gives it rather than the type of the whole query. A field
 * with a projection, such as `items[] { … }` or `author-> { … }`, hovers as what the projection
 * makes of it.
 *
 * A filter `[]` is read in the scope of the array it filters, as that array is before the filter
 * runs, so a field in a filter hovers as every value it may have there: `_type` in
 * `*[_type == "post"]` is every document type. A projection `{}` after the filter is read in the
 * scope the filter narrowed it to, so the `_type` in `*[_type == "post"]{_type}` is `"post"`.
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
import { type FormattedType, formatTypes, objectShape } from './hover-format.js'

export interface FieldTypeOptions {
  schema: SchemaType
  functions?: Map<string, GroqFunction> | undefined
}

const SCOPE_KEY = '__scope'

/**
 * A scope an identifier is read in: the element of a filter `[`, a projection `{`, or the array a
 * `| order(` or `| score(` call sorts, which opens at its `|`.
 */
interface Frame {
  open: number
  bracket: '[' | '{' | '|'
}

/**
 * Describe the type of the identifier at `position`, or `null` when the schema does not say.
 */
export function resolveFieldType(
  query: string,
  position: number,
  options: FieldTypeOptions
): FormattedType | null {
  const masked = maskStrings(query)
  const word = wordAt(masked, position)
  if (!word || isInString(query, masked, word.start) || !isFieldReference(masked, word)) {
    return null
  }

  let frames = enclosingFrames(masked, word.start)

  const base = memberBaseStart(masked, word.start)
  const projectionEnd = projectionAfter(masked, word.end)
  if (projectionEnd !== undefined) {
    const projected = parentScope(frames, query.slice(base ?? word.start, projectionEnd + 1))
    const type =
      projected && scopeTypesAt(query, masked, projected.frames, projected.prefix, options)
    return type ? formatTypes([type], options.schema) : null
  }

  let prefix =
    base === undefined
      ? '@'
      : query.slice(base, word.start - (masked.charAt(word.start - 1) === '.' ? 1 : 0))
  const parent = parentScope(frames, prefix)
  if (!parent) {
    return null
  }
  ;({ frames, prefix } = parent)
  const scopeTypes = scopeTypesAt(query, masked, frames, prefix, options)
  if (!scopeTypes) {
    return null
  }

  const scoped = flatten(scopeTypes, options.schema)
  const baseMayBeNull = base !== undefined && scoped.some((type) => type.type === 'null')
  const found: Array<TypeNode> = []
  for (const object of scoped.filter(isObject)) {
    const attribute = object.attributes[word.text]
    if (attribute) {
      found.push(attribute.value)
      if (attribute.optional) {
        found.push({ type: 'null' })
      }
    }
  }
  if (found.length === 0) {
    return null
  }
  if (baseMayBeNull) {
    found.push({ type: 'null' })
  }
  return formatTypes(found, options.schema)
}

/**
 * `^` reads the scope around the one it is written in, so each `^` at the start of `prefix`
 * drops the innermost frame. `null` when there are more of them than frames.
 */
function parentScope(
  frames: Array<Frame>,
  prefix: string
): { frames: Array<Frame>; prefix: string } | null {
  let up = 0
  let rest = prefix
  while (rest.startsWith('^')) {
    up++
    rest = rest.slice(1).replace(/^\./, '')
  }
  if (up === 0) {
    return { frames, prefix }
  }
  return up <= frames.length
    ? { frames: frames.slice(0, frames.length - up), prefix: rest || '@' }
    : null
}

export interface StringLiteral {
  /** The literal as written, quotes included. */
  text: string
  /** The name the literal gives a projection or object attribute, when it is the key of one. */
  key?: string
  /** The type of the value given to that key, when the schema says. */
  keyType: FormattedType | null
}

/**
 * Describe the string literal that contains `position`, or `null` when `position` is not in one.
 *
 * A string is a value, so it never names a document type or a field: `"post"` in
 * `_type == "post"` hovers as itself. A string that is the key of a projection or object, as
 * `"overview"` in `{"overview": pt::text(overview)}`, hovers as the type of the value it is given.
 */
export function resolveStringLiteral(
  query: string,
  position: number,
  options?: FieldTypeOptions
): StringLiteral | null {
  const masked = maskStrings(query)
  const range = stringRangeAt(query, position)
  if (!range) {
    return null
  }
  const text = query.slice(range.start, range.end)
  if (!/^\s*:(?!:)/.test(masked.slice(range.end))) {
    return { text, keyType: null }
  }
  const key = keyName(text)
  const keyType = options ? projectionKeyType(query, masked, range, key, options) : null
  return { text, key, keyType }
}

interface StringRange {
  start: number
  end: number
}

/** The string literal, quotes included, that `position` is in: from its opening quote to past its closing one. */
function stringRangeAt(query: string, position: number): StringRange | null {
  let start: number | undefined
  let quote = ''
  for (let index = 0; index < query.length; index++) {
    const char = query.charAt(index)
    if (start === undefined) {
      if (char === '"' || char === "'") {
        start = index
        quote = char
      }
    } else if (char === '\\') {
      index++
    } else if (char === quote) {
      if (position >= start && position <= index) {
        return { start, end: index + 1 }
      }
      start = undefined
    }
  }
  return null
}

function projectionKeyType(
  query: string,
  masked: string,
  range: StringRange,
  key: string,
  options: FieldTypeOptions
): FormattedType | null {
  const frames = enclosingFrames(masked, range.start)
  const projection = frames.at(-1)
  if (projection?.bracket !== '{') {
    return null
  }
  const close = matchingClose(masked, projection.open)
  if (close === undefined) {
    return null
  }
  const start = postfixStart(masked, projection.open) ?? projection.open
  const preamble = query.slice(0, leadingDefinitions(query).at(-1)?.end ?? 0)
  if (start < preamble.length) {
    return null
  }
  const type = scopeTypesAt(
    query,
    masked,
    frames.slice(0, -1),
    query.slice(start, close + 1),
    options,
    preamble
  )
  if (!type) {
    return null
  }

  const found: Array<TypeNode> = []
  for (const object of flatten(type, options.schema).filter(isObject)) {
    const attribute = object.attributes[key]
    if (attribute) {
      found.push(attribute.value)
      if (attribute.optional) {
        found.push({ type: 'null' })
      }
    }
  }
  return found.length === 0 ? null : formatTypes(found, options.schema)
}

function keyName(literal: string): string {
  try {
    const value: unknown = JSON.parse(literal)
    if (typeof value === 'string') {
      return value
    }
  } catch {
    // A single-quoted literal is not JSON; its text is the key.
  }
  return literal.slice(1, -1)
}

export interface ParamType {
  /** The name of the parameter, without the `$`. */
  name: string
  /** What the query uses the parameter as, or `null` when nothing in it says. */
  type: FormattedType | null
}

const COMPARISON_BEFORE = /(==|!=|<=|>=|<|(?<![=-])>|\bin|\bmatch)\s*$/
const COMPARISON_AFTER = /^\s*(==|!=|<=|>=|<|>|in\b|match\b)/

/**
 * Describe the parameter under `position`, or `null` when `position` is not on one.
 *
 * A parameter has no declared type, so it is inferred from how the query uses it, across every
 * use of the name: compared (`==`, `!=`, `<`, `>`, `<=`, `>=`) or tested with `in` against a
 * value the schema types, it has that type; `match` makes it a string; an index or slice bound
 * (`[0...$n]`) makes it a number. A parameter is read as a value that is given, so `null` is
 * left out of the type of the value it is compared to.
 */
export function resolveParamType(
  query: string,
  position: number,
  options?: FieldTypeOptions
): ParamType | null {
  const masked = maskStrings(query)
  const word = wordAt(masked, masked.charAt(position) === '$' ? position + 1 : position)
  if (
    !word ||
    masked.charAt(word.start - 1) !== '$' ||
    isInString(query, masked, word.start) ||
    position < word.start - 1 ||
    position > word.end
  ) {
    return null
  }
  if (!options) {
    return { name: word.text, type: null }
  }

  const types: Array<TypeNode> = []
  for (const use of masked.matchAll(new RegExp(`\\$${word.text}(?![A-Za-z0-9_])`, 'g'))) {
    types.push(...paramUseTypes(query, masked, use.index, use.index + use[0].length, options))
  }
  return { name: word.text, type: types.length > 0 ? formatTypes(types, options.schema) : null }
}

/** The types the use of a parameter in `[start, end)` gives it. */
function paramUseTypes(
  query: string,
  masked: string,
  start: number,
  end: number,
  options: FieldTypeOptions
): Array<TypeNode> {
  const before = masked.slice(0, start)
  const after = masked.slice(end)

  if (isIndexOrSlice(masked, start, end)) {
    return [{ type: 'number' }]
  }

  const paramIsOnRight = COMPARISON_BEFORE.test(before)
  const operator = COMPARISON_BEFORE.exec(before)?.[1] ?? COMPARISON_AFTER.exec(after)?.[1]
  if (!operator) {
    return []
  }
  if (operator === 'match') {
    return [{ type: 'string' }]
  }

  const operand = paramIsOnRight
    ? operandBefore(masked, before.search(COMPARISON_BEFORE))
    : operandAfter(masked, end + after.search(/\S/) + operator.length)
  if (!operand) {
    return []
  }

  const frames = enclosingFrames(masked, operand.start)
  const parent = parentScope(frames, query.slice(operand.start, operand.end))
  if (!parent) {
    return []
  }
  const operandType = scopeTypesAt(query, masked, parent.frames, parent.prefix, options, '', true)
  if (!operandType) {
    return []
  }

  if (operator === 'in') {
    return paramIsOnRight
      ? [{ type: 'array', of: { type: 'union', of: given(unionMembers(operandType)) } }]
      : given(flatten(operandType, options.schema))
  }
  return given(unionMembers(operandType))
}

function given(types: Array<TypeNode>): Array<TypeNode> {
  return types.filter((type) => type.type !== 'null')
}

/**
 * Whether the parameter is the index or a bound of a slice of a subscript, as in `[$i]`,
 * `[0...$n]` or `[$from..$to]`, and not an element of an array literal.
 */
function isIndexOrSlice(masked: string, start: number, end: number): boolean {
  const before = masked.slice(0, start).trimEnd()
  const after = masked.slice(end).trimStart()
  if (/\.\.\.?$/.test(before) || /^\.\.\.?/.test(after)) {
    return true
  }
  if (!before.endsWith('[') || !after.startsWith(']')) {
    return false
  }
  return postfixStart(masked, before.length - 1) !== undefined
}

/** The operand that ends before the operator at `operator`. */
function operandBefore(masked: string, operator: number): { start: number; end: number } | null {
  const end = trimmedEnd(masked, operator)
  const start = postfixStart(masked, end)
  return start === undefined ? null : { start, end }
}

/** The operand that starts at or after `from`. */
function operandAfter(masked: string, from: number): { start: number; end: number } | null {
  let start = from
  while (start < masked.length && /\s/.test(masked.charAt(start))) {
    start++
  }
  let end = start
  while (end < masked.length) {
    const char = masked.charAt(end)
    if (isPostfixChar(char) || char === '.' || char === ':') {
      end++
    } else if (char === '-' && masked.charAt(end + 1) === '>') {
      end += 2
    } else if ((char === '(' || char === '[' || char === '{') && end > start) {
      const close = matchingClose(masked, end)
      if (close === undefined) {
        break
      }
      end = close + 1
    } else {
      break
    }
  }
  return end > start && /[A-Za-z_@^]/.test(masked.charAt(start)) ? { start, end } : null
}

export interface CallType {
  /** `namespace::name`. */
  name: string
  type: FormattedType
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
  return { name: hovered.name, type: formatTypes([type], options.schema) }
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
  const stack: Array<{ char: string; index: number; pipe: number | undefined }> = []
  for (let index = 0; index < position; index++) {
    const char = masked.charAt(index)
    if (char === '[' || char === '{' || char === '(') {
      stack.push({ char, index, pipe: char === '(' ? pipedCall(masked, index) : undefined })
    } else if (char === ']' || char === '}' || char === ')') {
      stack.pop()
    }
  }
  const frames: Array<Frame> = []
  for (const { char, index, pipe } of stack) {
    if (char === '[' || char === '{') {
      frames.push({ open: index, bracket: char })
    } else if (pipe !== undefined) {
      frames.push({ open: pipe, bracket: '|' })
    }
  }
  return frames
}

/**
 * The `|` of `| order(` or `| score(` when `open` is the `(` that follows it. The arguments of
 * these calls are read in the scope of the elements of the array piped in.
 */
function pipedCall(masked: string, open: number): number | undefined {
  const name = /\b(order|score)\s*$/.exec(masked.slice(0, open))
  if (!name) {
    return undefined
  }
  const pipe = trimmedEnd(masked, name.index) - 1
  return masked.charAt(pipe) === '|' && masked.charAt(pipe - 1) !== '|' ? pipe : undefined
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
    if (char === ']' || char === ')' || char === '}') {
      const open = matchingOpen(masked, start - 1)
      if (open === undefined) {
        break
      }
      start = open
    } else if (isPostfixChar(char)) {
      const nameEnd = start
      while (start > 0 && isPostfixChar(masked.charAt(start - 1))) {
        start--
      }
      const pipe = masked.charAt(nameEnd) === '(' ? pipedCall(masked, nameEnd) : undefined
      if (pipe !== undefined) {
        return postfixStart(masked, pipe) ?? start
      }
      const previous = masked.charAt(start - 1)
      if (
        !isMemberDot(masked, start - 1) &&
        !(previous === '>' && masked.charAt(start - 2) === '-')
      ) {
        break
      }
    } else if (char === '>' && masked.charAt(start - 2) === '-') {
      start -= 2
    } else if (isMemberDot(masked, start - 1)) {
      start--
    } else {
      break
    }
  }
  return start < end ? start : undefined
}

/**
 * Whether the `.` at `index` reads an attribute, rather than being part of a `...` spread or a
 * `..` range.
 */
function isMemberDot(masked: string, index: number): boolean {
  return (
    masked.charAt(index) === '.' &&
    masked.charAt(index - 1) !== '.' &&
    masked.charAt(index + 1) !== '.'
  )
}

function isPostfixChar(char: string | undefined): boolean {
  return isIdentifierChar(char) || char === '*' || char === '@' || char === '^'
}

/**
 * The `}` of the projection that `showcaseProjects[] { … }` or `author-> { … }` applies to the
 * word ending at `end`, after any `[…]` and `->`. A field with a projection hovers as what the
 * projection makes of it, which is what the query returns under that key. `undefined` when the
 * word has no projection.
 */
function projectionAfter(masked: string, end: number): number | undefined {
  let index = skipSpaces(masked, end)
  while (index < masked.length) {
    const char = masked.charAt(index)
    if (char === '[') {
      const close = matchingClose(masked, index)
      if (close === undefined) {
        return undefined
      }
      index = close + 1
    } else if (char === '-' && masked.charAt(index + 1) === '>') {
      index += 2
    } else if (char === '{') {
      return matchingClose(masked, index)
    } else {
      return undefined
    }
    index = skipSpaces(masked, index)
  }
  return undefined
}

function skipSpaces(masked: string, index: number): number {
  while (index < masked.length && /\s/.test(masked.charAt(index))) {
    index++
  }
  return index
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
    isMemberDot(masked, wordStart - 1) ||
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
  preamble = '',
  narrowFilters = false
): TypeNode | undefined {
  const bases: Array<string> = []
  for (const frame of frames) {
    const start = postfixStart(masked, frame.open)
    if (start !== undefined) {
      const close =
        narrowFilters && frame.bracket === '[' ? matchingClose(masked, frame.open) : undefined
      bases.push(
        query.slice(start, close === undefined ? trimmedEnd(masked, frame.open) : close + 1)
      )
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

function unionMembers(type: TypeNode): Array<TypeNode> {
  return type.type === 'union' ? type.of.flatMap(unionMembers) : [type]
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
      return type.rest
        ? [{ type: 'object', attributes: Object.fromEntries(objectShape(type, schema).attributes) }]
        : [type]
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

function assertNever(value: never): never {
  throw new Error(`Unhandled type: ${JSON.stringify(value)}`)
}
