import { describe, it, expect } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { formatGroqFile, formatDocument } from '../capabilities/formatting'
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
