import { describe, it, expect } from 'vitest'
import * as prettier from 'prettier'
import { assertValidGroq } from '@sanity-labs/lint-core/testing'
import plugin from '../index.js'

/**
 * Format a GROQ query and validate the output is valid GROQ syntax.
 * This ensures the formatter never produces invalid GROQ.
 */
async function format(code: string, options: prettier.Options = {}): Promise<string> {
  const result = await prettier.format(code, {
    parser: 'groq',
    plugins: [plugin],
    ...options,
  })
  const trimmed = result.trim()

  // Validate that the formatted output is valid GROQ
  // This uses groq-js as the single source of truth
  assertValidGroq(trimmed, `Formatter produced invalid GROQ from: ${code}`)

  return trimmed
}

describe('prettier-plugin-groq', () => {
  describe('basic expressions', () => {
    it('formats everything (*)', async () => {
      expect(await format('*')).toBe('*')
    })

    it('formats this (@)', async () => {
      expect(await format('@')).toBe('@')
    })

    it('formats parent (^)', async () => {
      expect(await format('^')).toBe('^')
    })

    it('formats parameters', async () => {
      expect(await format('$slug')).toBe('$slug')
    })
  })

  describe('literals', () => {
    it('formats strings', async () => {
      expect(await format('"hello"')).toBe('"hello"')
    })

    it('formats strings with escapes', async () => {
      expect(await format('"hello\\nworld"')).toBe('"hello\\nworld"')
    })

    it('formats integers', async () => {
      expect(await format('42')).toBe('42')
    })

    it('formats floats', async () => {
      expect(await format('3.14')).toBe('3.14')
    })

    it('formats booleans', async () => {
      expect(await format('true')).toBe('true')
      expect(await format('false')).toBe('false')
    })

    it('formats null', async () => {
      expect(await format('null')).toBe('null')
    })
  })

  describe('filters', () => {
    it('formats simple filter', async () => {
      expect(await format('*[_type == "post"]')).toBe('*[_type == "post"]')
    })

    it('formats filter with AND', async () => {
      const result = await format('*[_type == "post" && published == true]')
      expect(result).toBe('*[_type == "post" && published == true]')
    })

    it('formats filter with OR', async () => {
      const result = await format('*[_type == "post" || _type == "article"]')
      expect(result).toBe('*[_type == "post" || _type == "article"]')
    })
  })

  describe('projections', () => {
    it('formats simple projection with shorthand', async () => {
      // Shorthand { title } is valid when key matches simple attribute
      const result = await format('*[_type == "post"]{ title, body }')
      expect(result).toBe('*[_type == "post"] { title, body }')
    })

    it('formats projection with computed key (must be quoted)', async () => {
      // GROQ requires quoted keys for non-shorthand: { "slug": slug.current }
      const result = await format('*[_type == "post"]{ "mySlug": slug.current }')
      expect(result).toBe('*[_type == "post"] { "mySlug": slug.current }')
    })

    it('formats projection with dot access (needs explicit key)', async () => {
      // { "slug": slug.current } - key must be quoted, cannot use shorthand
      const result = await format('*[_type == "post"]{ "slug": slug.current }')
      expect(result).toBe('*[_type == "post"] { "slug": slug.current }')
    })

    it('formats nested projection with dereference', async () => {
      const result = await format('*[_type == "post"]{ title, author->{ name } }')
      expect(result).toBe('*[_type == "post"] { title, author->{ name } }')
    })

    it('formats projection with array traversal and dereference', async () => {
      const result = await format('*[_type == "post"]{ categories[]->{ title } }')
      expect(result).toBe('*[_type == "post"] { categories[]->{ title } }')
    })
  })

  describe('slices', () => {
    it('formats exclusive slice', async () => {
      expect(await format('*[_type == "post"][0...10]')).toBe('*[_type == "post"][0...10]')
    })

    it('formats inclusive slice', async () => {
      expect(await format('*[_type == "post"][0..10]')).toBe('*[_type == "post"][0..10]')
    })
  })

  describe('dereference', () => {
    it('formats dereference', async () => {
      expect(await format('author->name')).toBe('author->name')
    })

    it('formats chained dereference', async () => {
      expect(await format('author->company->name')).toBe('author->company->name')
    })
  })

  describe('functions', () => {
    it('formats function call', async () => {
      expect(await format('count(*[_type == "post"])')).toBe('count(*[_type == "post"])')
    })

    it('formats namespaced function', async () => {
      expect(await format('pt::text(body)')).toBe('pt::text(body)')
    })
  })

  describe('pipes', () => {
    it('formats pipe function (short query stays on one line)', async () => {
      const result = await format('*[_type == "post"] | order(_createdAt desc)')
      // Short queries stay on one line
      expect(result).toBe('*[_type == "post"] | order(_createdAt desc)')
    })

    it('formats pipe function (long query wraps)', async () => {
      const result = await format(
        '*[_type == "post" && published == true && category == "tech"] | order(_createdAt desc)',
        { printWidth: 40 }
      )
      // Long queries wrap at the pipe
      expect(result).toContain('| order')
    })
  })

  describe('arrays', () => {
    it('formats empty array', async () => {
      expect(await format('[]')).toBe('[]')
    })

    it('formats array with elements', async () => {
      expect(await format('["a", "b", "c"]')).toBe('["a", "b", "c"]')
    })
  })

  describe('objects', () => {
    it('formats empty object', async () => {
      expect(await format('{}')).toBe('{}')
    })

    it('formats object with fields (keys must be quoted)', async () => {
      // GROQ object literals require quoted keys
      const result = await format('{ "total": count(*) }')
      expect(result).toBe('{ "total": count(*) }')
    })

    it('formats object with special characters in key', async () => {
      const result = await format('{ "my-field": 123 }')
      expect(result).toBe('{ "my-field": 123 }')
    })
  })

  describe('operators', () => {
    it('formats comparison operators', async () => {
      expect(await format('a == b')).toBe('a == b')
      expect(await format('a != b')).toBe('a != b')
      expect(await format('a < b')).toBe('a < b')
      expect(await format('a > b')).toBe('a > b')
      expect(await format('a <= b')).toBe('a <= b')
      expect(await format('a >= b')).toBe('a >= b')
    })

    it('formats in operator', async () => {
      expect(await format('_type in ["post", "article"]')).toBe('_type in ["post", "article"]')
    })

    it('formats match operator', async () => {
      expect(await format('title match "hello"')).toBe('title match "hello"')
    })

    it('formats not operator', async () => {
      expect(await format('!published')).toBe('!published')
    })
  })

  describe('ordering', () => {
    it('formats asc', async () => {
      const result = await format('*[_type == "post"] | order(title asc)')
      expect(result).toContain('title asc')
    })

    it('formats desc', async () => {
      const result = await format('*[_type == "post"] | order(title desc)')
      expect(result).toContain('title desc')
    })
  })

  describe('complex queries', () => {
    it('formats complex query with multiple features', async () => {
      const query = `*[_type == "post" && published == true]{ title, "slug": slug.current, author->{ name, image } }[0...10]`
      const result = await format(query)
      expect(result).toContain('_type == "post"')
      expect(result).toContain('published == true')
      expect(result).toContain('author->')
    })
  })
})
