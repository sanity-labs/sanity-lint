import { describe, expect, it } from 'vitest'
import type { ObjectAttribute, SchemaType, TypeNode } from 'groq-js'
import { getHoverInfo } from '../capabilities/hover.js'
import type { GroqFunction } from '../content-mapper/functions.js'
import type { GroqQuery } from '../types.js'

const string: TypeNode = { type: 'string' }

function attribute(value: TypeNode, optional?: boolean): ObjectAttribute {
  const result: ObjectAttribute = { type: 'objectAttribute', value }
  if (optional) {
    result.optional = true
  }
  return result
}

function documentType(
  name: string,
  attributes: Record<string, ObjectAttribute>
): SchemaType[number] {
  return {
    type: 'document',
    name,
    attributes: {
      _id: attribute(string),
      _type: attribute({ type: 'string', value: name }),
      ...attributes,
    },
  }
}

const schema: SchemaType = [
  documentType('page', {
    title: attribute(string),
    subtitle: attribute(string, true),
    slug: attribute({ type: 'object', attributes: { current: attribute(string) } }),
    body: attribute({ type: 'array', of: { type: 'object', attributes: {} } }),
    author: attribute({
      type: 'object',
      attributes: {
        _ref: attribute(string),
        _type: attribute({ type: 'string', value: 'reference' }),
      },
      dereferencesTo: 'author',
    }),
    seo: attribute({ type: 'inline', name: 'seo' }),
  }),
  documentType('post', {
    title: attribute({ type: 'number' }),
    views: attribute({ type: 'number' }),
  }),
  documentType('author', { name: attribute(string) }),
  {
    type: 'type',
    name: 'seo',
    value: { type: 'object', attributes: { description: attribute(string) } },
  },
]

const functions = new Map<string, GroqFunction>([
  [
    'image::richText',
    {
      name: 'image::richText',
      calls: [],
      file: 'groq/image.groq',
      source: 'fn image::richText($blocks) = $blocks[]{...};',
      start: 0,
      nameStart: 3,
      nameEnd: 18,
    },
  ],
])

function queryOf(text: string): GroqQuery {
  return { query: text, start: 0, end: text.length, line: 0, column: 0 }
}

function hoverText(text: string, marker: string, occurrence = 0, withSchema = true): string | null {
  let offset = -1
  for (let seen = 0; seen <= occurrence; seen++) {
    offset = text.indexOf(marker, offset + 1)
  }
  expect(offset).toBeGreaterThanOrEqual(0)
  const hover = getHoverInfo(
    queryOf(text),
    offset + 1,
    withSchema ? { schema, functions } : { functions }
  )
  const contents = hover?.contents
  return contents && typeof contents === 'object' && 'value' in contents ? contents.value : null
}

const PAGE_QUERY = `*[_type == "page" && slug.current == $slug][0] {
  _id,
  _type,
  "body": image::richText(body),
  overview,
  title,
  "slug": slug.current,
}`

describe('hover types', () => {
  it('hovers a projected field as the type the schema gives it', () => {
    expect(hoverText(PAGE_QUERY, 'title')).toContain('title: string')
    expect(hoverText(PAGE_QUERY, 'title')).not.toContain('object')
  })

  it('hovers a field of another type in the same projection', () => {
    expect(hoverText('*[_type == "post"]{title}', 'title')).toContain('title: number')
  })

  it('hovers an optional field as its schema type', () => {
    expect(hoverText('*[_type == "page"]{subtitle}', 'subtitle')).toContain('subtitle: string\n')
  })

  it('hovers _type in a projection as the type the query filters to', () => {
    const hover = hoverText(PAGE_QUERY, '_type', 1)
    expect(hover).toContain('_type: page\n')
    expect(hover).toContain('Document type name')
  })

  it('hovers _type in a filter as the type it is compared to', () => {
    expect(hoverText(PAGE_QUERY, '_type')).toContain('_type: page\n')
    expect(hoverText('*[_type == "page"][0]', '_type')).toContain('_type: page\n')
    expect(hoverText('*[_type == "page"]', '_type')).toContain('_type: page\n')
  })

  it('finds the type filter when it is not the first clause', () => {
    expect(hoverText('*[slug.current == $slug && _type == "page"][0]', '_type')).toContain(
      '_type: page\n'
    )
  })

  it('hovers _type as the union of OR-ed type names', () => {
    const query = '*[_type == "page" || _type == "post"]{_type}'
    expect(hoverText(query, '_type')).toContain('_type: page | post\n')
    expect(hoverText(query, '_type', 2)).toContain('_type: page | post\n')
    expect(hoverText('*[_type in ["page", "post"]]', '_type')).toContain('_type: page | post\n')
  })

  it('does not narrow _type when an OR branch does not filter on it', () => {
    const hover = hoverText('*[_type == "page" || defined(title)][0]', '_type')
    expect(hover).not.toContain('_type: page\n')
  })

  it('hovers the segments of a path through the schema', () => {
    expect(hoverText(PAGE_QUERY, 'current')).toContain('current: string')
    expect(hoverText(PAGE_QUERY, 'slug', 3)).toContain('slug: { current: string }')
  })

  it('hovers fields reached through a dereference', () => {
    expect(hoverText('*[_type == "page"]{"name": author->name}', 'name', 1)).toContain(
      'name: string'
    )
  })

  it('hovers fields in a nested projection', () => {
    expect(hoverText('*[_type == "page"][0]{author->{name}}', 'name')).toContain('name: string')
    expect(hoverText('*[_type == "page"][0]{seo{description}}', 'description')).toContain(
      'description: string'
    )
  })

  it('hovers a field used as a function argument', () => {
    expect(hoverText(PAGE_QUERY, 'body', 1)).toContain('body: array<object>')
  })

  it('hovers a field in a filter against the document types in scope', () => {
    expect(hoverText('*[_type == "post" && views > 3]', 'views')).toContain('views: number')
  })

  it('keeps the old hover for a field the schema does not have', () => {
    const hover = hoverText(PAGE_QUERY, 'overview')
    expect(hover).toContain('overview: ')
    expect(hover).toContain('object | null')
  })

  it('keeps the old hover without a schema', () => {
    expect(hoverText(PAGE_QUERY, 'title', 0, false)).toBe('**title** (field)')
    expect(hoverText(PAGE_QUERY, '_type', 1, false)).toBe(
      '**_type** (system-field)\n\nDocument type name'
    )
  })

  it('does not take a type name from a type the schema does not define', () => {
    expect(hoverText('*[_type == "missing"]', '_type')).not.toContain('_type: missing')
  })

  it('ignores brackets inside strings', () => {
    expect(hoverText('*[_type == "page" && subtitle == "{["]{title}', 'title', 1)).toContain(
      'title: string'
    )
  })
})
