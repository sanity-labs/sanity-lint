import { describe, it, expect } from 'vitest'
import type { SchemaType } from 'groq-js'
import { getCompletions, getCompletionTriggerCharacters } from '../capabilities/completion'
import type { GroqQuery } from '../types'

// Sample schema for testing
const sampleSchema: SchemaType = [
  {
    type: 'document',
    name: 'post',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'post' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
      body: { type: 'objectAttribute', value: { type: 'string' } },
      publishedAt: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
  {
    type: 'document',
    name: 'author',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'author' } },
      name: { type: 'objectAttribute', value: { type: 'string' } },
      bio: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
]

const makeQuery = (query: string): GroqQuery => ({
  query,
  start: 0,
  end: query.length,
  line: 0,
  column: 0,
})

describe('getCompletions', () => {
  describe('type value completions', () => {
    it('should suggest document types after _type ==', () => {
      const query = makeQuery('*[_type == "')
      const completions = getCompletions(query, query.query.length, { schema: sampleSchema })

      expect(completions.some((c) => c.label === 'post')).toBe(true)
      expect(completions.some((c) => c.label === 'author')).toBe(true)
    })

    it('should filter type suggestions by prefix', () => {
      const query = makeQuery('*[_type == "po')
      const completions = getCompletions(query, query.query.length, { schema: sampleSchema })

      expect(completions.some((c) => c.label === 'post')).toBe(true)
      expect(completions.some((c) => c.label === 'author')).toBe(false)
    })

    it('should return empty without schema', () => {
      const query = makeQuery('*[_type == "')
      const completions = getCompletions(query, query.query.length)

      // No schema means no type suggestions
      const typeCompletions = completions.filter((c) => c.detail === 'Document type')
      expect(typeCompletions).toHaveLength(0)
    })
  })

  describe('field completions', () => {
    it('should suggest fields in projection context', () => {
      const query = makeQuery('*[_type == "post"]{')
      const completions = getCompletions(query, query.query.length, { schema: sampleSchema })

      // Should include schema fields and system fields
      expect(completions.some((c) => c.label === '_id')).toBe(true)
      expect(completions.some((c) => c.label === '_type')).toBe(true)
    })

    it('should suggest schema fields for known document type', () => {
      // Position cursor inside projection where document type is known
      const query = makeQuery('*[_type == "post"]{ t')
      const completions = getCompletions(query, query.query.length, { schema: sampleSchema })

      // Should include title field that matches prefix "t"
      // Note: The context analysis looks for _type == "post" pattern
      expect(completions.some((c) => c.label === 'title')).toBe(true)
    })

    it('should include system fields', () => {
      const query = makeQuery('*[_type == "post"]{ _')
      const completions = getCompletions(query, query.query.length)

      expect(completions.some((c) => c.label === '_id')).toBe(true)
      expect(completions.some((c) => c.label === '_type')).toBe(true)
      expect(completions.some((c) => c.label === '_createdAt')).toBe(true)
      expect(completions.some((c) => c.label === '_updatedAt')).toBe(true)
    })
  })

  describe('duplicate labels', () => {
    const schemaWithSystemFields: SchemaType = [
      {
        type: 'document',
        name: 'slugPage',
        attributes: Object.fromEntries(
          [
            '_id',
            '_type',
            '_rev',
            '_createdAt',
            '_updatedAt',
            '_key',
            '_ref',
            'slug',
            'slugTitle',
          ].map((name) => [name, { type: 'objectAttribute', value: { type: 'string' } }])
        ),
      },
    ] as SchemaType

    it('lists each label once when the schema declares system fields', () => {
      const query = makeQuery('*[_type == "slugPage"]{ _')
      const completions = getCompletions(query, query.query.length, {
        schema: schemaWithSystemFields,
      })
      const labels = completions.map((c) => c.label)

      expect(labels).toHaveLength(new Set(labels).size)
      for (const name of ['_createdAt', '_id', '_key', '_ref', '_rev']) {
        expect(labels.filter((l) => l === name)).toHaveLength(1)
      }
    })

    it('keeps distinct labels that share a prefix', () => {
      const query = makeQuery('*[_type == "slugPage"]{ slug')
      const labels = getCompletions(query, query.query.length, {
        schema: schemaWithSystemFields,
      }).map((c) => c.label)

      expect(labels).toEqual(['slug', 'slugTitle'])
    })
  })

  describe('function completions', () => {
    it('should suggest functions', () => {
      const query = makeQuery('cou')
      const completions = getCompletions(query, query.query.length)

      expect(completions.some((c) => c.label === 'count')).toBe(true)
    })

    it('should include function signature in detail', () => {
      const query = makeQuery('coa')
      const completions = getCompletions(query, query.query.length)

      const coalesceCompletion = completions.find((c) => c.label === 'coalesce')
      expect(coalesceCompletion?.detail).toContain('coalesce')
    })

    it('should suggest namespace functions', () => {
      const query = makeQuery('pt::')
      const completions = getCompletions(query, query.query.length)

      expect(completions.some((c) => c.label === 'pt::text')).toBe(true)
    })

    it('should suggest math functions', () => {
      const query = makeQuery('math')
      const completions = getCompletions(query, query.query.length)

      expect(completions.some((c) => c.label === 'math::sum')).toBe(true)
      expect(completions.some((c) => c.label === 'math::avg')).toBe(true)
    })
  })

  describe('mixed context', () => {
    it('should provide field completions in projection', () => {
      // Inside projection, should get field completions
      const query = makeQuery('*[_type == "post"]{ _')
      const completions = getCompletions(query, query.query.length)

      // Should have system fields
      expect(completions.some((c) => c.label === '_id')).toBe(true)
      expect(completions.some((c) => c.label === '_type')).toBe(true)
    })

    it('should provide function completions when typing function names', () => {
      const query = makeQuery('count')
      const completions = getCompletions(query, query.query.length)

      expect(completions.some((c) => c.label === 'count')).toBe(true)
    })
  })
})

describe('getCompletionTriggerCharacters', () => {
  it('should include common trigger characters', () => {
    const triggers = getCompletionTriggerCharacters()

    expect(triggers).toContain('.')
    expect(triggers).toContain('"')
    expect(triggers).toContain("'")
    expect(triggers).toContain('[')
    expect(triggers).toContain('{')
  })
})
