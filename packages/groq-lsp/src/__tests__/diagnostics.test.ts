import { describe, it, expect } from 'vitest'
import type { SchemaType } from 'groq-js'
import { computeQueryDiagnostics, computeDocumentDiagnostics } from '../capabilities/diagnostics'
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
]

describe('computeQueryDiagnostics', () => {
  const makeQuery = (query: string): GroqQuery => ({
    query,
    start: 0,
    end: query.length,
    line: 0,
    column: 0,
  })

  describe('without schema', () => {
    it('should return empty for valid query', () => {
      const query = makeQuery('*[_type == "post"]')
      const result = computeQueryDiagnostics(query)

      expect(result.diagnostics).toHaveLength(0)
      expect(result.parseError).toBeUndefined()
    })

    it('should return parse error for invalid query', () => {
      const query = makeQuery('*[_type ==')
      const result = computeQueryDiagnostics(query)

      expect(result.parseError).toBeDefined()
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]?.message).toContain('Parse error')
    })

    it('should detect join-in-filter issue', () => {
      const query = makeQuery('*[author->name == "Bob"]')
      const result = computeQueryDiagnostics(query)

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics.some((d) => d.code === 'join-in-filter')).toBe(true)
    })
  })

  describe('with schema', () => {
    it('should detect invalid type filter', () => {
      const query = makeQuery('*[_type == "psot"]')
      const result = computeQueryDiagnostics(query, { schema: sampleSchema })

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics.some((d) => d.code === 'invalid-type-filter')).toBe(true)
    })

    it('should detect unknown field', () => {
      const query = makeQuery('*[_type == "post"]{ titel }')
      const result = computeQueryDiagnostics(query, { schema: sampleSchema })

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics.some((d) => d.code === 'unknown-field')).toBe(true)
    })

    it('should not report errors for valid query with schema', () => {
      const query = makeQuery('*[_type == "post"]{ title, body }')
      const result = computeQueryDiagnostics(query, { schema: sampleSchema })

      // May have performance warnings but no schema errors
      const schemaErrors = result.diagnostics.filter(
        (d) => d.code === 'invalid-type-filter' || d.code === 'unknown-field'
      )
      expect(schemaErrors).toHaveLength(0)
    })

    it('should not flag _type filters on array items as document types', () => {
      const query = makeQuery('*[_type == "post"]{ "images": content[_type == "imageBlock"] }')
      const result = computeQueryDiagnostics(query, { schema: sampleSchema })

      expect(result.diagnostics.filter((d) => d.code === 'invalid-type-filter')).toHaveLength(0)
    })
  })

  describe('diagnostic positions', () => {
    it('should adjust position for query offset in document', () => {
      const query: GroqQuery = {
        query: '*[author->name == "Bob"]',
        start: 50,
        end: 74,
        line: 2,
        column: 10,
      }
      const result = computeQueryDiagnostics(query)

      // Diagnostics should be relative to document, not query
      if (result.diagnostics.length > 0) {
        expect(result.diagnostics[0]?.range.start.line).toBeGreaterThanOrEqual(2)
      }
    })
  })
})

describe('computeDocumentDiagnostics', () => {
  it('should compute diagnostics for multiple queries', () => {
    const queries: GroqQuery[] = [
      { query: '*[author->name == "Bob"]', start: 0, end: 24, line: 0, column: 0 },
      { query: '*[_type == "psot"]', start: 50, end: 68, line: 2, column: 0 },
    ]

    const result = computeDocumentDiagnostics(queries, { schema: sampleSchema })

    // Should have diagnostics from both queries
    expect(result.length).toBeGreaterThan(0)
  })

  it('should return empty for empty query list', () => {
    const result = computeDocumentDiagnostics([])
    expect(result).toHaveLength(0)
  })

  it('should return empty for valid queries', () => {
    const queries: GroqQuery[] = [
      { query: '*[_type == "post"]', start: 0, end: 18, line: 0, column: 0 },
    ]

    const result = computeDocumentDiagnostics(queries, { schema: sampleSchema })

    // Should have no schema-related diagnostics
    const schemaErrors = result.filter(
      (d) => d.code === 'invalid-type-filter' || d.code === 'unknown-field'
    )
    expect(schemaErrors).toHaveLength(0)
  })
})

describe('diagnostic severity', () => {
  it('should map error severity correctly', () => {
    const query: GroqQuery = {
      query: '*[_type == "psot"]',
      start: 0,
      end: 18,
      line: 0,
      column: 0,
    }
    const result = computeQueryDiagnostics(query, { schema: sampleSchema })

    const typeError = result.diagnostics.find((d) => d.code === 'invalid-type-filter')
    expect(typeError?.severity).toBe(1) // DiagnosticSeverity.Error
  })

  it('should map warning severity correctly', () => {
    const query: GroqQuery = {
      query: '*[_type == "post"]{ titel }',
      start: 0,
      end: 27,
      line: 0,
      column: 0,
    }
    const result = computeQueryDiagnostics(query, { schema: sampleSchema })

    const fieldWarning = result.diagnostics.find((d) => d.code === 'unknown-field')
    expect(fieldWarning?.severity).toBe(2) // DiagnosticSeverity.Warning
  })
})
