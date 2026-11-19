/**
 * Extract GROQ queries from source files
 *
 * Supports:
 * - .groq files (entire content is GROQ)
 * - .ts/.tsx/.js/.jsx files (groq`...`, defineQuery(`...`) and /* groq *\/ `...` templates)
 */

import type { ExtractionResult, GroqQuery } from '../types.js'

/**
 * Extract GROQ queries from a document based on its language/file type
 */
export function extractQueries(content: string, languageId: string): ExtractionResult {
  switch (languageId) {
    case 'groq':
      return extractFromGroqFile(content)
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return extractFromJsTs(content)
    default:
      return { queries: [], errors: [] }
  }
}

/**
 * Convert a document offset to a 0-indexed line and column
 */
function offsetToLineColumn(content: string, offset: number) {
  let line = 0
  let lineStart = 0
  for (let i = content.indexOf('\n'); i !== -1 && i < offset; i = content.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return { line, column: offset - lineStart }
}

/**
 * Extract from a .groq file - the entire content is a GROQ query
 */
function extractFromGroqFile(content: string): ExtractionResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { queries: [], errors: [] }
  }

  const start = content.indexOf(trimmed)

  return {
    queries: [
      {
        query: trimmed,
        start,
        end: start + trimmed.length,
        ...offsetToLineColumn(content, start),
      },
    ],
    errors: [],
  }
}

/**
 * Matches the text that introduces an embedded GROQ template literal. The
 * lookahead leaves the opening backtick for the caller to consume.
 * - groq`...`
 * - defineQuery(`...`)
 * - /* groq *\/ `...`
 *
 * Only template literals are recognised: quoted strings may contain escapes
 * that shift offsets, and formatting them would break the surrounding code.
 */
const EMBEDDED_QUERY_PREFIX =
  /\bgroq\s*(?=`)|\bdefineQuery\s*\(\s*(?=`)|\/\*\s*groq\s*\*\/\s*(?=`)/g

/** A `${` that an odd number of backslashes does not escape. */
const INTERPOLATION = /(?<!\\)(?:\\\\)*\$\{/

interface TextRange {
  start: number
  end: number
}

/**
 * Characters after which a `/` starts a regular expression literal rather than
 * a division. A heuristic, but it only has to keep quotes and backticks inside
 * regular expressions from being read as strings.
 */
const REGEXP_PRECEDING_CHARS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''))

/**
 * True when `/` at `index` opens a JSX closing tag (`</div>`, `</>`) rather
 * than a regexp. Needed because `<` is a regexp-preceding character, so without
 * this check `</div>` would be scanned as a regexp through the next `/` or
 * newline and could hide a same-line embedded query.
 */
function isJsxClosingSlash(content: string, index: number): boolean {
  let j = index + 1
  while (j < content.length && (content[j] === ' ' || content[j] === '\t')) {
    j++
  }
  if (content[j] === '>') {
    return true
  }
  if (j < content.length && /[A-Za-z_$]/.test(content[j]!)) {
    j++
    while (j < content.length && /[\w$:.-]/.test(content[j]!)) {
      j++
    }
    while (j < content.length && (content[j] === ' ' || content[j] === '\t')) {
      j++
    }
    return content[j] === '>'
  }
  return false
}

/**
 * Find the comments, string literals and template literal text in JS/TS
 * source: everywhere `groq` followed by a backtick is prose, not a tag. The
 * code inside `${...}` of a template literal is scanned as code. Strings end at
 * a line break so that an unbalanced quote, like an apostrophe in JSX text,
 * hides at most the rest of its line.
 */
function findNonCodeRanges(content: string): Array<TextRange> {
  const ranges: Array<TextRange> = []
  // Braces opened since the innermost open `${`, and the depths of the `${`s around it.
  let braceDepth = 0
  const outerBraceDepths: Array<number> = []
  let lastSignificant = ''

  const skipTemplateText = (from: number) => {
    let i = from
    while (i < content.length) {
      const char = content[i]
      if (char === '\\') {
        i += 2
      } else if (char === '`') {
        ranges.push({ start: from, end: i })
        return i + 1
      } else if (char === '$' && content[i + 1] === '{') {
        ranges.push({ start: from, end: i })
        outerBraceDepths.push(braceDepth)
        braceDepth = 0
        return i + 2
      } else {
        i++
      }
    }
    ranges.push({ start: from, end: content.length })
    return content.length
  }

  let i = 0
  while (i < content.length) {
    const char = content[i]!
    const next = content[i + 1]
    if (char === '/' && next === '/') {
      const end = content.indexOf('\n', i)
      const stop = end === -1 ? content.length : end
      ranges.push({ start: i, end: stop })
      i = stop
    } else if (char === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2)
      const stop = end === -1 ? content.length : end + 2
      ranges.push({ start: i, end: stop })
      i = stop
    } else if (char === '"' || char === "'") {
      let j = i + 1
      while (j < content.length && content[j] !== char && content[j] !== '\n') {
        j += content[j] === '\\' ? 2 : 1
      }
      ranges.push({ start: i, end: j + 1 })
      i = j + 1
      lastSignificant = char
    } else if (char === '`') {
      i = skipTemplateText(i + 1)
      lastSignificant = '`'
    } else if (
      char === '/' &&
      (lastSignificant === '' || REGEXP_PRECEDING_CHARS.has(lastSignificant)) &&
      !(lastSignificant === '<' && isJsxClosingSlash(content, i))
    ) {
      let j = i + 1
      let inClass = false
      while (j < content.length && content[j] !== '\n') {
        const c = content[j]
        if (c === '\\') {
          j++
        } else if (c === '[') {
          inClass = true
        } else if (c === ']') {
          inClass = false
        } else if (c === '/' && !inClass) {
          break
        }
        j++
      }
      ranges.push({ start: i, end: j + 1 })
      i = j + 1
      lastSignificant = '/'
    } else {
      if (char === '{') {
        braceDepth++
      } else if (char === '}' && braceDepth === 0 && outerBraceDepths.length > 0) {
        braceDepth = outerBraceDepths.pop()!
        i = skipTemplateText(i + 1)
        lastSignificant = '`'
        continue
      } else if (char === '}') {
        braceDepth--
      }
      if (!/\s/.test(char)) {
        lastSignificant = char
      }
      i++
    }
  }
  return ranges
}

/**
 * Extract GROQ from JavaScript/TypeScript files
 * Looks for groq`...`, defineQuery(`...`) and /* groq *\/ `...` templates
 * outside comments and strings
 * (nested backticks are not handled; that would need a proper parser)
 */
function extractFromJsTs(content: string): ExtractionResult {
  const queries: Array<GroqQuery> = []
  const errors: Array<string> = []
  const nonCode = findNonCodeRanges(content)

  EMBEDDED_QUERY_PREFIX.lastIndex = 0

  let match
  while ((match = EMBEDDED_QUERY_PREFIX.exec(content)) !== null) {
    const { index } = match
    const enclosing = nonCode.find((range) => index >= range.start && index < range.end)
    // A `/* groq */` marker is itself a comment, so it may start one, but not sit inside one.
    if (enclosing && !(match[0].startsWith('/*') && enclosing.start === index)) {
      continue
    }

    const queryStart = match.index + match[0].length + 1
    const queryEnd = content.indexOf('`', queryStart)
    if (queryEnd === -1) {
      continue
    }

    const query = content.slice(queryStart, queryEnd)
    queries.push({
      query,
      start: queryStart,
      end: queryEnd,
      ...offsetToLineColumn(content, queryStart),
      ...(INTERPOLATION.test(query) && { interpolated: true }),
    })

    EMBEDDED_QUERY_PREFIX.lastIndex = queryEnd + 1
  }

  return { queries, errors }
}

/**
 * Find which query (if any) contains a given offset
 */
export function findQueryAtOffset(
  queries: Array<GroqQuery>,
  offset: number
): GroqQuery | undefined {
  return queries.find((q) => offset >= q.start && offset <= q.end)
}

/**
 * Convert a document offset to a position within a query
 * Returns the offset relative to the query start
 */
export function offsetToQueryPosition(query: GroqQuery, documentOffset: number): number {
  return documentOffset - query.start
}
