import { describe, it, expect } from 'vitest'
import type { SchemaType } from 'groq-js'
import { lint } from '../../linter'

/**
 * Test schema with common document types
 */
const testSchema: SchemaType = [
  {
    type: 'document',
    name: 'post',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'post' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
      body: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
  {
    type: 'document',
    name: 'author',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'author' } },
      name: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
  {
    type: 'document',
    name: 'category',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'category' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
]

const keyed = (name: string) => ({
  type: 'object' as const,
  attributes: { _key: { type: 'objectAttribute' as const, value: { type: 'string' as const } } },
  rest: { type: 'inline' as const, name },
})

const literal = (value: string) => ({
  type: 'objectAttribute' as const,
  value: { type: 'string' as const, value },
})

/**
 * Schema in the shape produced by `sanity schema extract`, with object types
 * used as discriminated union members in arrays.
 */
const unionSchema: SchemaType = [
  {
    type: 'type',
    name: 'textBlock',
    value: {
      type: 'object',
      attributes: {
        _type: literal('textBlock'),
        text: { type: 'objectAttribute', value: { type: 'string' }, optional: true },
      },
    },
  },
  {
    type: 'type',
    name: 'imageBlock',
    value: {
      type: 'object',
      attributes: {
        _type: literal('imageBlock'),
        asset: { type: 'objectAttribute', value: { type: 'string' }, optional: true },
      },
    },
  },
  {
    type: 'type',
    name: 'author.reference',
    value: {
      type: 'object',
      attributes: {
        _ref: { type: 'objectAttribute', value: { type: 'string' } },
        _type: literal('reference'),
      },
      dereferencesTo: 'author',
    },
  },
  {
    type: 'document',
    name: 'post',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: literal('post'),
      title: { type: 'objectAttribute', value: { type: 'string' }, optional: true },
      content: {
        type: 'objectAttribute',
        value: {
          type: 'array',
          of: { type: 'union', of: [keyed('textBlock'), keyed('imageBlock')] },
        },
        optional: true,
      },
      author: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'author.reference' },
        optional: true,
      },
      authors: {
        type: 'objectAttribute',
        value: { type: 'array', of: keyed('author.reference') },
        optional: true,
      },
      section: {
        type: 'objectAttribute',
        value: {
          type: 'object',
          attributes: {
            items: {
              type: 'objectAttribute',
              value: { type: 'array', of: keyed('textBlock') },
              optional: true,
            },
          },
        },
        optional: true,
      },
      tags: {
        type: 'objectAttribute',
        value: { type: 'array', of: { type: 'string' } },
        optional: true,
      },
      external: { type: 'objectAttribute', value: { type: 'unknown' }, optional: true },
    },
  },
  {
    type: 'document',
    name: 'author',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: literal('author'),
      name: { type: 'objectAttribute', value: { type: 'string' }, optional: true },
      bio: {
        type: 'objectAttribute',
        value: {
          type: 'array',
          of: {
            type: 'union',
            of: [
              {
                type: 'object',
                attributes: { _type: literal('block') },
                rest: {
                  type: 'object',
                  attributes: { _key: { type: 'objectAttribute', value: { type: 'string' } } },
                },
              },
              {
                type: 'object',
                attributes: {
                  _type: literal('quote'),
                  text: { type: 'objectAttribute', value: { type: 'string' }, optional: true },
                },
                rest: {
                  type: 'object',
                  attributes: { _key: { type: 'objectAttribute', value: { type: 'string' } } },
                },
              },
            ],
          },
        },
        optional: true,
      },
    },
  },
]

const typeFilterErrors = (query: string) =>
  lint(query, { schema: unionSchema }).findings.filter((f) => f.ruleId === 'invalid-type-filter')

describe('invalid-type-filter: array item filters (#27)', () => {
  describe('valid', () => {
    it.each([
      // The exact query from the issue
      '*[_type == "post"]{ "images": content[_type == "imageBlock"] }',
      '*[_type == "post"]{ "text": content[_type == "textBlock"].text }',
      '*[_type == "post"]{ "blocks": content[_type == "imageBlock" || _type == "textBlock"] }',
      '*[_type == "post"]{ "first": content[_type == "imageBlock"][0] }',
      '*[_type == "post"]{ "images": content[]{ ... }[_type == "imageBlock"] }',
      '*[_type == "post"]{ "content": content[]{ _type == "imageBlock" => { asset } } }',
      '*[_type == "post"]{ "content": content[]{ "kind": select(_type == "imageBlock" => "img") } }',
      '*[_type == "post"]{ "n": count(content[_type == "imageBlock"]) }',
      '*[_type == "post" && count(content[_type == "imageBlock"]) > 0]',
      '*[_type == "post"]{ "items": section.items[_type == "textBlock"] }',
      '*[_type == "post"]{ section{ "items": items[_type == "textBlock"] } }',
      // Inline object members declared inside the array's `of`
      '*[_type == "author"]{ "quotes": bio[_type == "quote"] }',
      '*[_type == "author"]{ "blocks": bio[_type == "block"] }',
      // Through dereferences
      '*[_type == "post"]{ author->{ "quotes": bio[_type == "quote"] } }',
      '*[_type == "post"]{ "quotes": author->bio[_type == "quote"] }',
      '*[_type == "post"]{ authors[]->{ "quotes": bio[_type == "quote"] } }',
      '*[_type == "post"]{ "authors": authors[]->[_type == "author"] }',
      // Parent scope
      '*[_type == "post"]{ "x": content[^._type == "post"] }',
      // Nested document queries still validate against documents
      '*[_type == "post"]{ "authors": *[_type == "author" && references(^._id)] }',
    ])('accepts %s', (query) => {
      expect(typeFilterErrors(query)).toHaveLength(0)
    })

    it.each([
      // Unknown field / unknown context: skip rather than risk a false positive
      '*[_type == "post"]{ "x": nonexistent[_type == "imageBlock"] }',
      '*[_type == "post"]{ "x": external[_type == "whatever"] }',
      '$items[_type == "imageBlock"]',
      '*[_type == "post"]{ "x": coalesce(content, [])[_type == "imageBlock"] }',
      '*[_type == "post"]{ "x": tags[_type == "imageBlock"] }',
    ])('skips unknown context in %s', (query) => {
      expect(typeFilterErrors(query)).toHaveLength(0)
    })
  })

  describe('invalid', () => {
    it('still flags nonexistent document types at the top level', () => {
      const errors = typeFilterErrors('*[_type == "imageBlock"]')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toBe('Document type "imageBlock" does not exist in schema')
    })

    it('still flags nonexistent document types in nested document queries', () => {
      const errors = typeFilterErrors('*[_type == "post"]{ "x": *[_type == "athor"] }')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toBe('Document type "athor" does not exist in schema')
      expect(errors[0]?.suggestions?.[0]?.replacement).toBe('author')
    })

    it('flags a typo in an array item type with suggestions from the array members', () => {
      const errors = typeFilterErrors(
        '*[_type == "post"]{ "images": content[_type == "imageBlok"] }'
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toBe('Type "imageBlok" is not a possible type here')
      expect(errors[0]?.help).toContain('"imageBlock"')
      expect(errors[0]?.suggestions?.[0]?.replacement).toBe('imageBlock')
    })

    it('flags a type that exists in the schema but is not allowed in the array', () => {
      const errors = typeFilterErrors(
        '*[_type == "post"]{ "items": section.items[_type == "imageBlock"] }'
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.help).toBe('Possible types: "textBlock"')
    })

    it('flags invalid types in conditional projections over array items', () => {
      const errors = typeFilterErrors(
        '*[_type == "post"]{ "content": content[]{ _type == "videoBlock" => { url } } }'
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain('videoBlock')
    })

    it('flags reverse comparisons on array items', () => {
      const errors = typeFilterErrors('*[_type == "post"]{ "x": content["imageBlok" == _type] }')
      expect(errors).toHaveLength(1)
      expect(errors[0]?.suggestions?.[0]?.replacement).toBe('imageBlock')
    })

    it('validates _type comparisons against dereference targets', () => {
      // Filtering a single (non-array) value has no element type to check against
      expect(typeFilterErrors('*[_type == "post"]{ "x": author->[_type == "post"] }')).toHaveLength(
        0
      )
      const projected = typeFilterErrors('*[_type == "post"]{ author->{ "x": _type == "post" } }')
      expect(projected).toHaveLength(1)
      expect(projected[0]?.message).toBe('Type "post" is not a possible type here')
      expect(projected[0]?.help).toBe('Possible types: "author"')
      expect(projected[0]?.suggestions).toEqual([])
    })

    it('flags invalid types in arrays reached through a dereference', () => {
      const errors = typeFilterErrors(
        '*[_type == "post"]{ author->{ "x": bio[_type == "qoute"] } }'
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.suggestions?.[0]?.replacement).toBe('quote')
    })
  })
})

describe('invalid-type-filter', () => {
  describe('valid', () => {
    it('accepts valid document type', () => {
      const result = lint('*[_type == "post"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(0)
    })

    it('accepts another valid document type', () => {
      const result = lint('*[_type == "author"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(0)
    })

    it('accepts valid type with other conditions', () => {
      const result = lint('*[_type == "post" && title == "Hello"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(0)
    })

    it('accepts reverse comparison order', () => {
      const result = lint('*["post" == _type]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(0)
    })
  })

  describe('invalid', () => {
    it('detects typo in document type', () => {
      const result = lint('*[_type == "psot"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0].message).toContain('psot')
      expect(typeErrors[0].message).toContain('does not exist')
    })

    it('suggests similar types for typos', () => {
      const result = lint('*[_type == "psot"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0].help).toContain('post')
    })

    it('detects non-existent type', () => {
      const result = lint('*[_type == "article"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0].message).toContain('article')
    })

    it('detects typo in reverse comparison', () => {
      const result = lint('*["athor" == _type]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0].help).toContain('author')
    })

    it('provides suggestions array', () => {
      const result = lint('*[_type == "psot"]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0].suggestions).toBeDefined()
      expect(typeErrors[0].suggestions?.length).toBeGreaterThan(0)
      expect(typeErrors[0].suggestions?.[0].replacement).toBe('post')
    })
  })

  describe('help text', () => {
    const memberNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']
    const manyMembersSchema: SchemaType = [
      {
        type: 'document',
        name: 'page',
        attributes: {
          _type: { type: 'objectAttribute', value: { type: 'string', value: 'page' } },
          blocks: {
            type: 'objectAttribute',
            value: {
              type: 'array',
              of: {
                type: 'union',
                of: memberNames.map((name) => ({
                  type: 'object' as const,
                  attributes: {
                    _type: {
                      type: 'objectAttribute' as const,
                      value: { type: 'string' as const, value: name },
                    },
                  },
                })),
              },
            },
          },
        },
      },
    ]

    it('truncates long lists of possible types', () => {
      const result = lint('*[_type == "page"]{ "x": blocks[_type == "zzzzzzzzzz"] }', {
        schema: manyMembersSchema,
      })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0]?.help).toBe(
        'Possible types: "alpha", "bravo", "charlie", "delta", "echo"...'
      )
    })

    it('handles empty type names', () => {
      const result = lint('*[_type == ""]', { schema: testSchema })
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(1)
      expect(typeErrors[0]?.help).toBe('Available types: post, author, category')
    })
  })

  describe('without schema', () => {
    it('does not run when no schema is provided', () => {
      const result = lint('*[_type == "nonexistent"]')
      const typeErrors = result.findings.filter((f) => f.ruleId === 'invalid-type-filter')
      expect(typeErrors).toHaveLength(0)
    })
  })
})
