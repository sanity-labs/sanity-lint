import { describe, it, expect } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { formatGroqFile, formatDocument } from '../capabilities/formatting'
import { format as groqWasmFormat } from '@sanity-labs/groq-wasm'
import { extractQueries } from '../utils/groq-extractor'

function applyFormat(content: string, edits: Awaited<ReturnType<typeof formatGroqFile>>) {
  const doc = TextDocument.create('file:///test.groq', 'groq', 1, content)
  return TextDocument.applyEdits(doc, edits)
}

describe('formatGroqFile', () => {
  const unformatted = '*[_type=="post"]{title,body}'

  it('produces a range starting at line 0 when the file has no leading blank lines', async () => {
    const edits = await formatGroqFile(unformatted)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.range.start).toEqual({ line: 0, character: 0 })
    expect(edits[0]?.range.end).toEqual({ line: 0, character: unformatted.length })
  })

  it('offsets the edit range when the file starts with blank lines', async () => {
    const content = `\n\n${unformatted}\n`
    const edits = await formatGroqFile(content)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.range.start).toEqual({ line: 2, character: 0 })
    expect(edits[0]?.range.end).toEqual({ line: 2, character: unformatted.length })
  })

  it('offsets the edit range by leading indentation on the first query line', async () => {
    const content = `\n   ${unformatted}`
    const edits = await formatGroqFile(content)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.range.start).toEqual({ line: 1, character: 3 })
    expect(edits[0]?.range.end).toEqual({ line: 1, character: 3 + unformatted.length })
  })

  it('does not duplicate or drop content when applying edits to a file with leading blank lines', async () => {
    const content = `\n\n\n${unformatted}\n`
    const edits = await formatGroqFile(content)
    const result = applyFormat(content, edits)

    const expected = applyFormat(unformatted, await formatGroqFile(unformatted))
    expect(result.trim()).toBe(expected.trim())
    expect(result.match(/_type/g)).toHaveLength(1)
    expect(result.startsWith('\n\n\n')).toBe(true)
  })

  it('computes the end of the range for multi-line queries after leading blank lines', async () => {
    const content = `\n\n*[_type == "post"]{\n  title,\n  body}\n`
    const edits = await formatGroqFile(content)
    const result = applyFormat(content, edits)

    expect(result.match(/_type/g)).toHaveLength(1)
    expect(result.startsWith('\n\n*[')).toBe(true)
  })

  it('returns no edits when the file is already formatted', async () => {
    const [first] = await formatGroqFile(unformatted)
    const formatted = first?.newText ?? ''
    const edits = await formatGroqFile(`\n\n${formatted}\n`)

    expect(edits).toEqual([])
  })
})

describe('formatDocument', () => {
  it('formats embedded queries using the extracted positions', async () => {
    const content = 'const a = 1\n\nconst q = groq`*[_type=="post"]{title,body}`\n'
    const { queries } = extractQueries(content, 'typescript')
    const edits = await formatDocument(queries, content)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.range.start).toEqual({ line: 2, character: 15 })
  })
})

const reindent = (text: string, unit: string) =>
  text.replaceAll(/^(?: {2})+/gm, (indent) => unit.repeat(indent.length / 2))

describe('formatting matches groq-wasm format', () => {
  const query =
    '*[_type == "post"]{title, "author": author->{name, "slug": slug.current}, "long": select(a == 1 => "one one one one one one", a == 2 => "two two two two two", "x")}'

  const cases = [
    { options: {}, unit: '  ' },
    { options: { tabSize: 2, insertSpaces: true }, unit: '  ' },
    { options: { tabSize: 4, insertSpaces: true }, unit: '    ' },
    { options: { tabSize: 4, insertSpaces: false }, unit: '\t' },
    { options: { tabSize: 2, insertSpaces: false }, unit: '\t' },
  ]

  it.each(cases)('formats .groq files with $options', async ({ options, unit }) => {
    const expected = reindent(groqWasmFormat(query).trimEnd(), unit)
    expect(expected).toContain(`\n${unit}${unit}a == 2`)

    const edits = await formatGroqFile(`${query}\n`, options)
    expect(edits.map((edit) => edit.newText)).toEqual([expected])
  })

  it.each(cases)('formats embedded queries with $options', async ({ options, unit }) => {
    const content = `const q = groq\`${query}\`\n`
    const { queries } = extractQueries(content, 'typescript')
    const edits = await formatDocument(queries, content, options)

    expect(edits.map((edit) => edit.newText)).toEqual([
      reindent(groqWasmFormat(query).trimEnd(), unit),
    ])
  })

  it('passes printWidth to groq-wasm as the width', async () => {
    const edits = await formatGroqFile(query, { printWidth: 40 })

    expect(edits.map((edit) => edit.newText)).toEqual([
      groqWasmFormat(query, { width: 40 }).trimEnd(),
    ])
    expect(groqWasmFormat(query, { width: 40 })).not.toBe(groqWasmFormat(query))
  })

  it('returns no edits for a query that does not parse', async () => {
    expect(await formatGroqFile('*[_type == ]')).toEqual([])
  })
})
