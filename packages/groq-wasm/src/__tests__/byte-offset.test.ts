import { describe, expect, it } from 'vitest'

import type { SourceLocation, SourceSpan } from '@sanity-labs/lint-core'

import { lint } from '../index.js'

/**
 * Location at a JavaScript string index.
 * `column` counts UTF-16 code units, which is what `string.length` reports.
 */
function locationAt(query: string, index: number): SourceLocation {
  const lines = query.slice(0, index).split('\n')
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
    offset: index,
  }
}

function spanCovering(query: string, text: string): SourceSpan {
  const start = query.indexOf(text)
  expect(start).toBeGreaterThanOrEqual(0)
  return {
    start: locationAt(query, start),
    end: locationAt(query, start + text.length),
  }
}

function spanFor(query: string, ruleId: string): SourceSpan {
  const finding = lint(query).find((item) => item.ruleId === ruleId)
  if (!finding?.span) {
    throw new Error(`expected a ${ruleId} finding with a span`)
  }
  return finding.span
}

describe('UTF-8 byte offset locations', () => {
  it('keeps ASCII columns identical to the string index', () => {
    const query = '*[author->name == "Bob"]'
    expect(spanFor(query, 'join-in-filter')).toEqual(spanCovering(query, 'author->'))
    expect(spanFor(query, 'join-in-filter').start).toEqual({ line: 1, column: 3, offset: 2 })
  })

  it('places a finding after a 2-byte character (å)', () => {
    const query = '*[title == "blåbær" && author->name == "Bob"]'
    const span = spanFor(query, 'join-in-filter')

    expect(new TextEncoder().encode('å').length).toBe(2)
    expect(span).toEqual(spanCovering(query, 'author->'))
    expect(span.start).toEqual({ line: 1, column: 24, offset: 23 })
    expect(query.slice(span.start.offset, span.end.offset)).toBe('author->')
  })

  it('places a finding after a 3-byte character (€)', () => {
    const query = '*[title == "€" && author->name == "Bob"]'
    const span = spanFor(query, 'join-in-filter')

    expect(new TextEncoder().encode('€').length).toBe(3)
    expect(span).toEqual(spanCovering(query, 'author->'))
    expect(span.start).toEqual({ line: 1, column: 19, offset: 18 })
    expect(query.slice(span.start.offset, span.end.offset)).toBe('author->')
  })

  it('counts a 4-byte emoji as two UTF-16 columns', () => {
    const query = '*[title == "😀" && author->name == "Bob"]'
    const span = spanFor(query, 'join-in-filter')

    // U+1F600 is 4 UTF-8 bytes and a surrogate pair (2 UTF-16 code units).
    // A Unicode-scalar column would be 19 here; editors expect 20.
    expect('😀'.length).toBe(2)
    expect(new TextEncoder().encode('😀').length).toBe(4)
    expect(span).toEqual({
      start: { line: 1, column: 20, offset: 19 },
      end: { line: 1, column: 28, offset: 27 },
    })
    expect(query.slice(span.start.offset, span.end.offset)).toBe('author->')
  })

  it('places a finding on the next line after non-ASCII text', () => {
    const query = '// blåbær\n*[author->name == "Bob"]'
    const span = spanFor(query, 'join-in-filter')

    expect(span).toEqual(spanCovering(query, 'author->'))
    expect(span.start).toEqual({ line: 2, column: 3, offset: 12 })
    expect(span.end).toEqual({ line: 2, column: 11, offset: 20 })
  })

  it('maps a multi-line span that contains 2-byte, 3-byte, and 4-byte text', () => {
    const query = '*[\n  title == "å€😀" &&\n  author->name == "x"\n]'
    const filter = '[\n  title == "å€😀" &&\n  author->name == "x"\n]'

    expect(new TextEncoder().encode('å').length).toBe(2)
    expect(new TextEncoder().encode('€').length).toBe(3)
    expect(new TextEncoder().encode('😀').length).toBe(4)

    const join = spanFor(query, 'join-in-filter')
    expect(join).toEqual(spanCovering(query, 'author->'))
    expect(join.start.line).toBe(3)
    expect(query.slice(join.start.offset, join.end.offset)).toBe('author->')

    const unlimited = spanFor(query, 'unlimited-query')
    expect(unlimited).toEqual(spanCovering(query, filter))
    expect(unlimited.start).toEqual({ line: 1, column: 2, offset: 1 })
    expect(unlimited.end.line).toBe(4)
    expect(query.slice(unlimited.start.offset, unlimited.end.offset)).toBe(filter)
  })
})
