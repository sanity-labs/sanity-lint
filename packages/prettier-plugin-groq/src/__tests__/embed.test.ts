import { describe, it, expect } from 'vitest'
import { format } from 'prettier'
import groqPlugin from '../index.js'
import embedPlugin from '../embed.js'

/**
 * Test embedded GROQ formatting in JavaScript/TypeScript files.
 */

async function formatJS(code: string): Promise<string> {
  const result = await format(code, {
    parser: 'babel',
    plugins: [groqPlugin, embedPlugin],
    printWidth: 60,
    semi: false,
    singleQuote: true,
  })
  return result.trim()
}

describe('embedded GROQ in JavaScript', () => {
  describe('tagged template literals', () => {
    it('formats groq tagged template literal', async () => {
      const input = `const query = groq\`*[_type=="post"]{title,body}\``
      const result = await formatJS(input)
      // Should contain formatted GROQ
      expect(result).toContain('groq')
      expect(result).toContain('`')
    })

    it('formats defineQuery tagged template literal', async () => {
      const input = `const query = defineQuery\`*[_type=="post"]{title}\``
      const result = await formatJS(input)
      expect(result).toContain('defineQuery')
    })
  })

  describe('function calls', () => {
    it('formats defineQuery with string literal', async () => {
      const input = `const query = defineQuery("*[_type==\\"post\\"]{title}")`
      const result = await formatJS(input)
      expect(result).toContain('defineQuery')
    })

    it('formats defineQuery with template literal', async () => {
      const input = `const query = defineQuery(\`*[_type=="post"]{title}\`)`
      const result = await formatJS(input)
      expect(result).toContain('defineQuery')
    })
  })

  describe('template interpolations', () => {
    it('restores ${expr} in a defineQuery template literal', async () => {
      const input = `const postQuery = defineQuery(\`
  *[_type == "post"][0] {
    title,
    image { \${imageFragment} }
  }
\`)`
      const result = await formatJS(input)
      expect(result).toContain('image { ${imageFragment} }')
      expect(result).not.toContain('__expr')
    })

    it('restores ${expr} in a groq tagged template', async () => {
      const input = `const q = groq\`*[_type=="post"]{title, \${frag}}\``
      const result = await formatJS(input)
      expect(result).toContain('${frag}')
      expect(result).not.toContain('__expr')
    })

    it('restores expressions used as filter values', async () => {
      const input = `const q = groq\`*[_type=="post"&&slug==\${slug}]{title}\``
      const result = await formatJS(input)
      expect(result).toContain('slug == ${slug}')
      expect(result).not.toContain('__expr')
    })

    it('restores multiple expressions in order, including complex ones', async () => {
      const input = `const q = groq\`*[_type=="post"]{\${a}, "x": \${b.c(1)}, \${d ? e : f}}\``
      const result = await formatJS(input)
      expect(result).toContain('${a}')
      expect(result).toContain('${b.c(1)}')
      expect(result).toContain('${d ? e : f}')
      expect(result.indexOf('${a}')).toBeLessThan(result.indexOf('${b.c(1)}'))
      expect(result.indexOf('${b.c(1)}')).toBeLessThan(result.indexOf('${d ? e : f}'))
      expect(result).not.toContain('__expr')
    })

    it('is idempotent', async () => {
      const input = `const q = groq\`*[_type=="post"]{title, \${frag}}\``
      const once = await formatJS(input)
      expect(await formatJS(once)).toBe(once)
    })
  })

  describe('preserves code structure', () => {
    it('preserves imports and other code', async () => {
      const input = `
import { groq } from 'next-sanity'

const query = groq\`*[_type=="post"]{title}\`

export default query
`
      const result = await formatJS(input)
      expect(result).toContain("import { groq } from 'next-sanity'")
      expect(result).toContain('export default query')
    })
  })
})
