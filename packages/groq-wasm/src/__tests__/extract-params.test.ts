import { describe, expect, it } from 'vitest'

import { extractParams, format, lint, WasmError } from '../index.js'

function names(query: string): string[] {
  return extractParams(query).map((param) => param.name)
}

/** Every reference's text, so spans are checked against the query itself. */
function referencedText(query: string): string[] {
  return extractParams(query).flatMap((param) =>
    param.references.map((reference) => query.slice(reference.start, reference.end))
  )
}

describe('extractParams', () => {
  it('returns an empty list for a query without parameters', () => {
    expect(extractParams('*[_type == "post"]{title}')).toEqual([])
    expect(extractParams('*')).toEqual([])
  })

  it('returns an empty list for an empty or whitespace-only query, like lint', () => {
    for (const query of ['', '   ', '\n', '\t']) {
      expect(extractParams(query)).toEqual([])
      expect(lint(query)).toEqual([])
    }
  })

  it('reports a parameter with its name and span', () => {
    expect(extractParams('*[_type == $type]')).toEqual([
      {
        name: 'type',
        references: [{ start: 11, end: 16, line: 1, column: 12, endLine: 1, endColumn: 17 }],
      },
    ])
  })

  it('lists distinct names in order of first reference', () => {
    expect(names('*[_type == $type && _id == $id && slug.current == $slug]')).toEqual([
      'type',
      'id',
      'slug',
    ])
  })

  it('groups duplicate references under one name, in source order', () => {
    const query = '*[_type == $type || $type in categories]{"t": $type, "id": $id}'
    const params = extractParams(query)
    expect(params.map((param) => param.name)).toEqual(['type', 'id'])

    const [type] = params
    expect(type?.references).toHaveLength(3)
    const starts = type?.references.map((reference) => reference.start) ?? []
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    for (const reference of type?.references ?? []) {
      expect(query.slice(reference.start, reference.end)).toBe('$type')
    }
  })

  it('finds parameters in slices, element indexes, and ranges', () => {
    expect(names('*[_type == "post"][$offset...$limit]')).toEqual(['offset', 'limit'])
    expect(names('*[_type == "post"][$offset..$limit]')).toEqual(['offset', 'limit'])
    expect(names('*[_type == "post"][$index]')).toEqual(['index'])
  })

  it('finds parameters in function arguments and projections', () => {
    expect(names('*[defined($field) && references($ref)]{"n": count($items)}')).toEqual([
      'field',
      'ref',
      'items',
    ])
    expect(names('*[_type == "post"] | order($order) [0...10]')).toEqual(['order'])
  })

  it('finds parameters in nested subqueries', () => {
    const query =
      '*[_type == "author" && $slug == slug.current]{name, "posts": *[_type == "post" && references(^._id) && category == $category][0...$count]{title}}'
    expect(names(query)).toEqual(['slug', 'category', 'count'])
    expect(referencedText(query)).toEqual(['$slug', '$category', '$count'])
  })

  it('skips custom function parameters inside the function body', () => {
    expect(names('fn ex::double($n) = $n * 2; *{"x": ex::double(1)}')).toEqual([])
  })

  it('still reports a custom function parameter name used outside its body', () => {
    const query = 'fn ex::double($n) = $n * 2; *[count == ex::double($n)]'
    const params = extractParams(query)
    expect(params).toHaveLength(1)
    expect(params[0]?.name).toBe('n')
    expect(params[0]?.references).toHaveLength(1)
    expect(params[0]?.references[0]?.start).toBe(query.lastIndexOf('$n'))
  })

  it('reports free parameters used inside a custom function body', () => {
    expect(
      names(
        'fn pt::isPublished($doc) = $doc.publishedAt < $now && _type == $type; *[pt::isPublished(@) && _id == $id]'
      )
    ).toEqual(['now', 'type', 'id'])
  })

  it('ignores parameter-like text in strings and comments', () => {
    expect(names('// $skipped\n*[_type == "$notAParam" && name == $name] // $alsoSkipped')).toEqual(
      ['name']
    )
  })

  it('locates references on later lines', () => {
    const query = '*[\n  _type == $type\n]{\n  "t": $type\n}'
    expect(extractParams(query)).toEqual([
      {
        name: 'type',
        references: [
          { start: 14, end: 19, line: 2, column: 12, endLine: 2, endColumn: 17 },
          { start: 30, end: 35, line: 4, column: 8, endLine: 4, endColumn: 13 },
        ],
      },
    ])
    expect(referencedText(query)).toEqual(['$type', '$type'])
  })

  it('converts UTF-8 byte offsets after non-ASCII text to UTF-16 indices', () => {
    // "é中😀" is 9 UTF-8 bytes (2 + 3 + 4) but 4 UTF-16 code units (1 + 1 + 2),
    // so the parser's byte offset for `$type` is 5 past the string index.
    const query = '*[title == "é中😀" && _type == $type]'
    const [param] = extractParams(query)
    const start = query.indexOf('$type')
    expect(param?.references).toEqual([
      { start, end: start + 5, line: 1, column: start + 1, endLine: 1, endColumn: start + 6 },
    ])
    expect(new TextEncoder().encode(query.slice(0, start)).length).toBe(start + 5)
  })

  it('reports a bare `$` with an empty name, as groq-parser and format accept it', () => {
    expect(format('*[a == $]')).toBe('*[a == $]')
    expect(extractParams('*[a == $]')).toEqual([
      {
        name: '',
        references: [{ start: 7, end: 8, line: 1, column: 8, endLine: 1, endColumn: 9 }],
      },
    ])
  })

  it('throws WasmError with PARSE_ERROR on invalid syntax, like lint and format', () => {
    for (const query of ['*[_type == ]', '*[_type == $type', '*[_type == $type]]']) {
      expect(() => extractParams(query)).toThrow(WasmError)
      try {
        extractParams(query)
      } catch (error) {
        expect((error as WasmError).code).toBe('PARSE_ERROR')
      }
    }
    expect(() => lint('*[_type == ]')).toThrow(WasmError)
    expect(() => format('*[_type == ]')).toThrow(WasmError)
  })
})
