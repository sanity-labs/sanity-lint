import { describe, expect, it } from 'vitest'
import { lint } from '../linter'

const definitions = `// Image helpers
fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
// Trailing comment`

describe('lint', () => {
  describe('a document of only fn definitions', () => {
    it('is not a syntax error', () => {
      const result = lint(definitions)

      expect(result.parseError).toBeUndefined()
      expect(result.findings).toEqual([])
      expect(result.query).toBe(definitions)
    })

    it('is not a syntax error with the TypeScript rules alone', () => {
      expect(lint(definitions, { forceTs: true }).parseError).toBeUndefined()
    })

    it('still reports a syntax error inside a definition', () => {
      expect(lint('fn image::asset($asset) = $asset->{url;').parseError).toBeDefined()
    })

    it('still reports a definition left unfinished', () => {
      expect(lint('fn image::asset($asset) = $asset{url}').parseError).toBeDefined()
    })

    it('still reports an expression left unfinished after the definitions', () => {
      expect(lint(`${definitions}\n*[_type == "post"] |`).parseError).toBeDefined()
      expect(lint(`${definitions}\n-`).parseError).toBeDefined()
    })

    it('lints the query after the definitions as before', () => {
      const result = lint(`${definitions}\n*[author->name == "Bob"]{"image": image::field(image)}`)

      expect(result.parseError).toBeUndefined()
      expect(result.findings.some((finding) => finding.ruleId === 'join-in-filter')).toBe(true)
    })
  })

  it('still reports a comment-only document as a syntax error', () => {
    expect(lint('// nothing here').parseError).toBeDefined()
  })
})
