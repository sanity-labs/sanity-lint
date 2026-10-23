import { describe, expect, it } from 'vitest'

import { format, isValidSyntax, lint, validate, WasmError } from '../index.js'

function syntaxError(query: string) {
  const result = validate(query)
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error(`expected ${JSON.stringify(query)} to fail validation`)
  }
  return result.error
}

/** UTF-8 byte length of the JS substring before `index`. */
function utf8BytesBefore(query: string, index: number): number {
  return new TextEncoder().encode(query.slice(0, index)).length
}

describe('validate', () => {
  it('accepts a valid query', () => {
    expect(validate('*[_type == "post"]')).toEqual({ ok: true })
  })

  it('accepts parameter references without declarations', () => {
    expect(validate('*[_type == $type]')).toEqual({ ok: true })
  })

  it('accepts non-ASCII text in a valid query', () => {
    expect(validate('*[_type == "café"]')).toEqual({ ok: true })
  })

  it('reports an empty query as a syntax error at the start', () => {
    expect(validate('')).toEqual({
      ok: false,
      error: {
        message: 'no query',
        start: 0,
        end: 0,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      },
    })
  })

  it('reports whitespace-only input as an empty query', () => {
    for (const query of ['   ', '\n', '\t']) {
      expect(syntaxError(query)).toMatchObject({
        message: 'no query',
        start: 0,
        end: 0,
        line: 1,
        column: 1,
      })
    }
  })

  it('keeps the empty-query behavior of lint, format, and isValidSyntax', () => {
    expect(lint('')).toEqual([])
    expect(format('')).toBe('')
    expect(isValidSyntax('')).toBe(true)
    expect(validate('').ok).toBe(false)
  })

  it('reports a syntax error at the start of the query', () => {
    const query = ']'
    expect(syntaxError(query)).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 0,
      end: 1,
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
    })
    expect(query.slice(0, 1)).toBe(']')
  })

  it('reports a syntax error in the middle of the query', () => {
    const query = '*[_type == ]'
    const error = syntaxError(query)
    expect(error).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 11,
      end: 12,
      line: 1,
      column: 12,
      endLine: 1,
      endColumn: 13,
    })
    expect(query.slice(error.start, error.end)).toBe(']')
  })

  it('reports a caret at a trailing token', () => {
    const query = '*[_type == "post"]]'
    const error = syntaxError(query)
    expect(error).toEqual({
      message: 'unable to parse entire expression',
      start: 18,
      end: 18,
      line: 1,
      column: 19,
      endLine: 1,
      endColumn: 19,
    })
    expect(query.charAt(error.start)).toBe(']')
    expect(query.slice(error.start, error.end)).toBe('')
  })

  it('reports a span that runs to the end of an unclosed filter', () => {
    const query = '*[_type == "post"'
    const error = syntaxError(query)
    expect(error).toEqual({
      message: "expected ']' following expression",
      start: 1,
      end: 17,
      line: 1,
      column: 2,
      endLine: 1,
      endColumn: 18,
    })
    expect(query.slice(error.start, error.end)).toBe('[_type == "post"')
  })

  it('places a multiline error on the following line', () => {
    const query = '*[_type == \n]'
    const error = syntaxError(query)
    expect(error).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 12,
      end: 13,
      line: 2,
      column: 1,
      endLine: 2,
      endColumn: 2,
    })
    expect(query.slice(error.start, error.end)).toBe(']')
  })

  it('converts a UTF-8 byte offset that follows a non-ASCII character', () => {
    const query = '*["é" == ]'
    const error = syntaxError(query)
    // "é" is U+00E9: 2 UTF-8 bytes, 1 UTF-16 code unit. The parser's byte
    // offset of "]" is 10; the JavaScript index is 9.
    expect(error).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 9,
      end: 10,
      line: 1,
      column: 10,
      endLine: 1,
      endColumn: 11,
    })
    expect(query.slice(error.start, error.end)).toBe(']')
    expect(utf8BytesBefore(query, error.start)).toBe(10)
    expect(error.start).not.toBe(utf8BytesBefore(query, error.start))
  })

  it('converts a UTF-8 byte offset that follows a 3-byte character', () => {
    const query = '*["中" == ]'
    const error = syntaxError(query)
    // "中" is U+4E2D: 3 UTF-8 bytes, 1 UTF-16 code unit. The parser's byte
    // offset of "]" is 11; the JavaScript index stays 9.
    expect(error).toMatchObject({ start: 9, end: 10, line: 1, column: 10 })
    expect(query.slice(error.start, error.end)).toBe(']')
    expect(utf8BytesBefore(query, error.start)).toBe(11)
  })

  it('converts a UTF-8 byte offset that follows an emoji', () => {
    const query = '*["😀" == ]'
    const error = syntaxError(query)
    // "😀" is U+1F600: 4 UTF-8 bytes, 2 UTF-16 code units (a surrogate pair).
    // The parser's byte offset of "]" is 12; the JavaScript index is 10,
    // which is after the pair rather than inside it.
    expect(error).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 10,
      end: 11,
      line: 1,
      column: 11,
      endLine: 1,
      endColumn: 12,
    })
    expect(query.slice(error.start, error.end)).toBe(']')
    expect(utf8BytesBefore(query, error.start)).toBe(12)
    expect(query.charCodeAt(error.start)).toBe(']'.charCodeAt(0))
    const highSurrogate = query.charCodeAt(3)
    expect(highSurrogate).toBeGreaterThanOrEqual(0xd800)
    expect(highSurrogate).toBeLessThanOrEqual(0xdbff)
    expect(error.start).toBeGreaterThan(4)
  })

  it('counts columns in UTF-16 units when non-ASCII precedes a later-line error', () => {
    const query = '*["é"\n== ]'
    const error = syntaxError(query)
    expect(error).toEqual({
      message: 'unexpected token "]", expected expression',
      start: 9,
      end: 10,
      line: 2,
      column: 4,
      endLine: 2,
      endColumn: 5,
    })
    expect(query.slice(error.start, error.end)).toBe(']')
    expect(utf8BytesBefore(query, error.start)).toBe(10)
  })

  it('still throws WasmError from lint and format on invalid syntax', () => {
    expect(() => lint(']')).toThrow(WasmError)
    expect(() => format(']')).toThrow(WasmError)
    try {
      format(']')
    } catch (error) {
      expect(error).toBeInstanceOf(WasmError)
      expect((error as WasmError).code).toBe('PARSE_ERROR')
    }
  })
})
