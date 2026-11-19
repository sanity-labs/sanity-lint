/**
 * Schema-aware types for hovering over a GROQ query
 *
 * Each part of a query hovers as the type groq-js gives it in the scope it is written in, which is
 * how the content mapper and `sanity typegen` type the query, so a hover shows what the generated
 * types say. A field hovers as its value there, or as what its projection makes of it when one
 * follows, as in `items[] { … }` or `author-> { … }`. A projection key hovers as the value it is
 * given, a function call as what it returns, and a `$param` as the type the generated
 * `QueryParams` gives it. {@link typeOfRange} describes the scope each part is read in.
 */

import type { SchemaType, TypeNode } from 'groq-js'
import { type GroqFunction, withGroqFunctions } from '../content-mapper/functions.js'
import { leadingDefinitions } from '../content-mapper/groq-scanner.js'
import { withoutLiterals } from './groq-probe.js'
import { type FormattedType, formatTypes } from './hover-format.js'
import { inferParamTypes } from './hover-params.js'
import { type MarkedRange, typeOfRange } from './hover-scope.js'

export interface FieldTypeOptions {
  schema: SchemaType
  functions?: Map<string, GroqFunction> | undefined
}

/**
 * Describe the type of the field at `position`, or `null` when `position` is not on a field or
 * groq-js cannot type it.
 */
export function resolveFieldType(
  query: string,
  position: number,
  options: FieldTypeOptions
): FormattedType | null {
  const masked = withoutLiterals(query)
  const word = wordAt(masked, position)
  if (
    !word ||
    isInString(query, masked, word.start) ||
    !isFieldReference(masked, word) ||
    word.start < preambleEnd(query)
  ) {
    return null
  }

  const start = memberBaseStart(masked, word.start) ?? word.start
  const projectionEnd = projectionAfter(masked, word.end)
  const end = projectionEnd === undefined ? word.end : projectionEnd + 1
  const as = isShorthandAttribute(masked, start, end) ? 'attribute' : 'expression'
  return formatted(typeOfRange(query, { start, end, as }, options), options.schema)
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
  const masked = withoutLiterals(query)
  const range = stringRangeAt(masked, position)
  if (!range) {
    return null
  }
  const text = query.slice(range.start, range.end)
  if (!/^\s*:(?!:)/.test(masked.slice(range.end))) {
    return { text, keyType: null }
  }
  const key = keyName(text)
  const keyType =
    options && range.start >= preambleEnd(query)
      ? formatted(typeOfRange(query, { ...range, as: 'key' }, options), options.schema)
      : null
  return { text, key, keyType }
}

interface StringRange {
  start: number
  end: number
}

/**
 * The string literal, quotes included, that `position` is in. `masked` blanks the contents of
 * strings and comments, so the quote after an opening one closes it.
 */
function stringRangeAt(masked: string, position: number): StringRange | null {
  let start: number | undefined
  for (let index = 0; index < masked.length; index++) {
    const char = masked.charAt(index)
    if (char !== '"' && char !== "'") {
      continue
    }
    if (start === undefined) {
      start = index
      continue
    }
    if (position >= start && position <= index) {
      return { start, end: index + 1 }
    }
    start = undefined
  }
  return null
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

/**
 * Describe the parameter under `position`, or `null` when `position` is not on one. Its type is
 * the one the generated `QueryParams` gives it; see {@link inferParamTypes}.
 */
export function resolveParamType(
  query: string,
  position: number,
  options?: FieldTypeOptions
): ParamType | null {
  const masked = withoutLiterals(query)
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

  let type: TypeNode | undefined
  try {
    const prepared = options.functions ? withGroqFunctions(query, options.functions) : query
    type = inferParamTypes(prepared, options.schema).get(word.text)
  } catch {
    type = undefined
  }
  return { name: word.text, type: formatted(type, options.schema) }
}

export interface CallType {
  /** The function's name, `namespace::name` for a namespaced one. */
  name: string
  /** Whether the query defines the function or `functions` holds it, rather than GROQ. */
  custom: boolean
  type: FormattedType
}

const CALL = /([A-Za-z_]\w*)\s*(?:::\s*([A-Za-z_]\w*)\s*)?\(/g
const NOT_FUNCTIONS = new Set(['in', 'match', 'asc', 'desc', 'fn', 'true', 'false', 'null'])

/**
 * Describe what the function call under `position` returns, or `null` when `position` is not on
 * the name or the parentheses of a call, or groq-js cannot type it. A pipe function, as
 * `| order(…)`, returns what it makes of the array piped in. The arguments of the call are left
 * to {@link resolveFieldType}.
 */
export function resolveCallType(
  query: string,
  position: number,
  options: FieldTypeOptions
): CallType | null {
  const masked = withoutLiterals(query)
  const definitions = leadingDefinitions(query)
  const preamble = definitions.at(-1)?.end ?? 0

  for (const match of masked.matchAll(CALL)) {
    const [, first, second] = match
    const open = match.index + match[0].length - 1
    const close = matchingClose(masked, open)
    const before = masked.slice(0, match.index)
    if (
      close === undefined ||
      match.index < preamble ||
      NOT_FUNCTIONS.has(first!) ||
      /(::|(?<!\.)\.|\$)\s*$/.test(before) ||
      /\bfn\s*$/.test(before)
    ) {
      continue
    }
    if (!((position >= match.index && position <= open) || position === close)) {
      continue
    }

    const name = second === undefined ? first! : `${first}::${second}`
    const pipe = second === undefined ? pipeBefore(masked, match.index) : undefined
    const start = pipe === undefined ? match.index : (postfixStart(masked, pipe) ?? match.index)
    const range: MarkedRange = { start, end: close + 1, as: 'expression' }
    const type = formatted(typeOfRange(query, range, options), options.schema)
    if (!type) {
      return null
    }
    const custom =
      definitions.some((definition) => definition.name === name) ||
      Boolean(options.functions?.has(name))
    return { name, custom, type }
  }
  return null
}

function formatted(type: TypeNode | undefined, schema: SchemaType): FormattedType | null {
  return type ? formatTypes([type], schema) : null
}

/** Where the `fn` definitions at the start of `query` end, and the query they serve begins. */
function preambleEnd(query: string): number {
  return leadingDefinitions(query).at(-1)?.end ?? 0
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

/** Whether `index` is in a string or a comment, which `masked` blanks out. */
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
  return !NOT_FUNCTIONS.has(word.text)
}

/**
 * Whether `[start, end)` is a whole attribute of an object or projection written without a key,
 * as `title` or `author->{name}` in `{title, author->{name}}`.
 */
function isShorthandAttribute(masked: string, start: number, end: number): boolean {
  const before = masked.slice(0, start).trimEnd()
  const after = masked.slice(end).trimStart()
  return (
    (before.endsWith('{') || before.endsWith(',')) &&
    (after.startsWith(',') || after.startsWith('}')) &&
    innermostOpen(masked, start) === '{'
  )
}

/** The bracket that is open at `position`, if any. */
function innermostOpen(masked: string, position: number): string | undefined {
  const stack: Array<string> = []
  for (let index = 0; index < position; index++) {
    const char = masked.charAt(index)
    if (char === '[' || char === '{' || char === '(') {
      stack.push(char)
    } else if (char === ']' || char === '}' || char === ')') {
      stack.pop()
    }
  }
  return stack.at(-1)
}

/** The `|` before the pipe function whose name starts at `nameStart`, as in `| order(`. */
function pipeBefore(masked: string, nameStart: number): number | undefined {
  const pipe = trimmedEnd(masked, nameStart) - 1
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
 * Start of the postfix expression that ends right before `end`: an operand such as `*`, `@`,
 * `^`, `$param`, a name, a call or a bracketed literal, with the traversals after it, as
 * `*[_type == "page"][0]`, `authors[]->`, `^.slug` or `*[…] | order(…)`. `undefined` when
 * nothing precedes `end`.
 */
function postfixStart(masked: string, end: number): number | undefined {
  const last = trimmedEnd(masked, end)
  // `start` is where the part of the expression read so far begins. Each step reads the element
  // before it: a bracketed group, a name, a `.` or a `->`.
  let start = last
  for (;;) {
    const before = trimmedEnd(masked, start)
    const char = masked.charAt(before - 1)
    if (before === 0) {
      break
    }
    if (char === ']' || char === '}' || char === ')') {
      const open = matchingOpen(masked, before - 1)
      if (open === undefined) {
        break
      }
      start = open
      if (char === ')') {
        // A call is where a chain starts, unless it is a pipe function applied to the one before.
        const call = callNameStart(masked, open)
        if (call !== undefined) {
          const pipe = pipeBefore(masked, call)
          start = pipe === undefined ? call : (postfixStart(masked, pipe) ?? call)
        }
        break
      }
      // A `[…]` or `{…}` after an operand traverses it; anywhere else it is an array or object.
      if (!endsOperand(masked, trimmedEnd(masked, start))) {
        break
      }
    } else if (isPostfixChar(char)) {
      start = before
      while (start > 0 && isPostfixChar(masked.charAt(start - 1))) {
        start--
      }
      // A name continues the chain only as the attribute after a `.` or `->`.
      const connector = trimmedEnd(masked, start)
      if (isMemberDot(masked, connector - 1)) {
        start = connector - 1
      } else if (masked.charAt(connector - 1) === '>' && masked.charAt(connector - 2) === '-') {
        start = connector - 2
      } else {
        break
      }
    } else if (char === '>' && masked.charAt(before - 2) === '-') {
      start = before - 2
    } else if (isMemberDot(masked, before - 1)) {
      start = before - 1
    } else {
      break
    }
  }
  return start < last ? start : undefined
}

/** Words that are operators or keywords, never names or operands. */
const OPERATOR_WORDS = new Set(['in', 'match', 'asc', 'desc', 'fn'])

/** Whether the text ending at `end` ends an operand, so a `[` or `{` after it traverses it. */
function endsOperand(masked: string, end: number): boolean {
  const char = masked.charAt(end - 1)
  if (char === ']' || char === ')' || char === '}') {
    return true
  }
  if (char === '>' && masked.charAt(end - 2) === '-') {
    return true
  }
  if (!isPostfixChar(char)) {
    return false
  }
  let start = end
  while (start > 0 && isPostfixChar(masked.charAt(start - 1))) {
    start--
  }
  return !OPERATOR_WORDS.has(masked.slice(start, end))
}

/** The start of the name of the function called with the `(` at `open`, namespace included. */
function callNameStart(masked: string, open: number): number | undefined {
  const name = /([A-Za-z_]\w*)(\s*::\s*[A-Za-z_]\w*)?\s*$/.exec(masked.slice(0, open))
  if (!name || NOT_FUNCTIONS.has(name[1]!) || /\$\s*$/.test(masked.slice(0, name.index))) {
    return undefined
  }
  return name.index
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
  return isIdentifierChar(char) || char === '*' || char === '@' || char === '^' || char === '$'
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

/**
 * Start of the expression whose attribute the word names (`slug` in `slug.current`).
 */
function memberBaseStart(masked: string, wordStart: number): number | undefined {
  const before = trimmedEnd(masked, wordStart)
  if (isMemberDot(masked, before - 1)) {
    return postfixStart(masked, before - 1)
  }
  if (masked.charAt(before - 1) === '>' && masked.charAt(before - 2) === '-') {
    return postfixStart(masked, before - 2)
  }
  return undefined
}
