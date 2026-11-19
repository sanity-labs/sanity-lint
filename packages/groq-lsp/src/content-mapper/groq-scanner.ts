/**
 * A GROQ scanner that finds `fn` definitions and the namespaced functions a query calls.
 *
 * groq-js inlines custom functions as it parses, so its syntax tree neither lists a file's
 * definitions nor shows which functions a query called. groq-content-mapper reads both with
 * GROQ's Rust parser; this scanner reads the same two things from the tokens, and leaves
 * checking the definitions to groq-js.
 */

interface Token {
  kind: 'identifier' | 'punctuation' | 'string' | 'other'
  text: string
  start: number
  end: number
}

function tokenize(source: string): Array<Token> {
  const tokens: Array<Token> = []
  let index = 0
  while (index < source.length) {
    const char = source.charAt(index)
    if (/\s/.test(char)) {
      index++
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index)
      index = newline === -1 ? source.length : newline + 1
      continue
    }
    const start = index
    if (char === '"' || char === "'") {
      index++
      while (index < source.length && source[index] !== char) {
        index += source[index] === '\\' ? 2 : 1
      }
      index = Math.min(index + 1, source.length)
      tokens.push({ kind: 'string', text: source.slice(start, index), start, end: index })
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      while (index < source.length && /\w/.test(source.charAt(index))) {
        index++
      }
      tokens.push({ kind: 'identifier', text: source.slice(start, index), start, end: index })
      continue
    }
    if (char === ':' && source[index + 1] === ':') {
      index += 2
      tokens.push({ kind: 'punctuation', text: '::', start, end: index })
      continue
    }
    index++
    tokens.push({
      kind: '(){}[];=,$'.includes(char) ? 'punctuation' : 'other',
      text: char,
      start,
      end: index,
    })
  }
  return tokens
}

const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])

/** The `namespace::name` called at `index`, when the tokens there are `namespace :: name (`. */
function callAt(tokens: Array<Token>, index: number): string | undefined {
  const [namespace, separator, name, paren] = tokens.slice(index, index + 4)
  if (
    namespace?.kind === 'identifier' &&
    separator?.text === '::' &&
    name?.kind === 'identifier' &&
    paren?.text === '('
  ) {
    return `${namespace.text}::${name.text}`
  }
  return undefined
}

function callsIn(tokens: Array<Token>): Array<string> {
  return [...new Set(callSpans(tokens).map((call) => call.name))]
}

/** A `namespace::name` in GROQ source, from the start of its namespace to the end of its name. */
export interface FunctionNameSpan {
  name: string
  start: number
  end: number
}

function callSpans(tokens: Array<Token>): Array<FunctionNameSpan> {
  const calls: Array<FunctionNameSpan> = []
  for (let index = 0; index < tokens.length; index++) {
    const name = callAt(tokens, index)
    const definesIt = tokens[index - 1]?.kind === 'identifier' && tokens[index - 1]?.text === 'fn'
    if (name && !definesIt) {
      calls.push({ name, start: tokens[index]!.start, end: tokens[index + 2]!.end })
    }
  }
  return calls
}

/** Every call of a namespaced function in `source`, in order, outside strings and comments. */
export function findFunctionCalls(source: string): Array<FunctionNameSpan> {
  return callSpans(tokenize(source))
}

/** The `;` that ends the definition starting at `from`, at bracket depth 0, and its index. */
function endOfDefinition(
  tokens: Array<Token>,
  from: number
): { index: number; end: number } | undefined {
  let depth = 0
  for (const [offset, { text, end }] of tokens.slice(from).entries()) {
    if (OPENERS.has(text)) {
      depth++
    } else if (CLOSERS.has(text)) {
      depth--
    } else if (text === ';' && depth <= 0) {
      return { index: from + offset, end }
    }
  }
  return undefined
}

/** A `fn namespace::name($param) = …;` definition. */
export interface ScannedDefinition {
  /** `namespace::name`. */
  name: string
  /** The namespaced functions its body calls, each once. */
  calls: Array<string>
  /** Where the definition starts, at its `fn`. */
  start: number
  /** Where it ends, after its `;`. */
  end: number
  /** Where its `namespace::name` starts. */
  nameStart: number
  /** Where its `namespace::name` ends. */
  nameEnd: number
}

/** A definition that could not be read, with where it starts. */
export interface DefinitionProblem {
  message: string
  /** Its `namespace::name`, when the header could be read. */
  name: string | null
  start: number
}

interface DefinitionsScan {
  definitions: Array<ScannedDefinition>
  problems: Array<DefinitionProblem>
  /** The index of the first token after the definitions. */
  rest: number
}

function scanDefinitions(tokens: Array<Token>, stopAtNonDefinition: boolean): DefinitionsScan {
  const definitions: Array<ScannedDefinition> = []
  const problems: Array<DefinitionProblem> = []
  let index = 0
  for (let head = tokens[index]; head; head = tokens[index]) {
    const end = endOfDefinition(tokens, index)
    if (head.kind !== 'identifier' || head.text !== 'fn') {
      if (stopAtNonDefinition) {
        break
      }
      problems.push({ message: 'Expected a "fn" definition', name: null, start: head.start })
      if (!end) {
        break
      }
      index = end.index + 1
      continue
    }
    const [namespace, separator, name, paren] = tokens.slice(index + 1, index + 5)
    const nameTokens =
      namespace?.kind === 'identifier' &&
      separator?.text === '::' &&
      name?.kind === 'identifier' &&
      paren?.text === '('
        ? { namespace, name }
        : null
    const header = nameTokens && `${nameTokens.namespace.text}::${nameTokens.name.text}`
    if (nameTokens === null || header === null || !end) {
      problems.push({
        message:
          header === null
            ? 'Expected "fn namespace::name($param) = ...;"'
            : 'The definition does not end with ";"',
        name: header,
        start: head.start,
      })
      if (!end) {
        break
      }
      index = end.index + 1
      continue
    }
    definitions.push({
      name: header,
      calls: callsIn(tokens.slice(index + 5, end.index)).filter((call) => call !== header),
      start: head.start,
      end: end.end,
      nameStart: nameTokens.namespace.start,
      nameEnd: nameTokens.name.end,
    })
    index = end.index + 1
  }
  return { definitions, problems, rest: index }
}

/** The `fn` definitions in a functions file, and the problems with those that cannot be read. */
export interface ParsedDefinitions {
  definitions: Array<ScannedDefinition>
  problems: Array<DefinitionProblem>
}

export function parseDefinitions(source: string): ParsedDefinitions {
  const { definitions, problems } = scanDefinitions(tokenize(source), false)
  return { definitions, problems }
}

/** The definitions a query, or a functions file, starts with. */
export function leadingDefinitions(query: string): Array<ScannedDefinition> {
  return scanDefinitions(tokenize(query), true).definitions
}

/** The functions a query defines at its start, and the namespaced functions it calls. */
export interface ParsedCalls {
  calls: Array<string>
  defines: Array<string>
}

export function parseCalls(query: string): ParsedCalls {
  const tokens = tokenize(query)
  const { definitions } = scanDefinitions(tokens, true)
  return {
    calls: callsIn(tokens),
    defines: definitions.map((definition) => definition.name),
  }
}
