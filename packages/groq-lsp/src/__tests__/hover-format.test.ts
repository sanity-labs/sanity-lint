import { describe, expect, it } from 'vitest'
import type { ObjectAttribute, SchemaType, TypeNode } from 'groq-js'
import {
  formatType,
  formatTypes,
  MAX_ATTRIBUTES_PER_OBJECT,
  MAX_DEPTH,
  MAX_TOTAL_ATTRIBUTES,
} from '../capabilities/hover-format.js'
import { getHoverInfo } from '../capabilities/hover.js'

const string: TypeNode = { type: 'string' }

function attribute(value: TypeNode, optional?: boolean): ObjectAttribute {
  return optional
    ? { type: 'objectAttribute', value, optional }
    : { type: 'objectAttribute', value }
}

function object(attributes: Record<string, ObjectAttribute>): TypeNode {
  return { type: 'object', attributes }
}

function nested(levels: number, leaf: TypeNode): TypeNode {
  return levels === 0 ? leaf : object({ child: attribute(nested(levels - 1, leaf)) })
}

describe('formatType', () => {
  it('prints an object with optional marks, literals and null', () => {
    const type = object({
      _type: attribute({ type: 'string', value: 'thing' }),
      label: attribute(string, true),
      count: attribute({ type: 'union', of: [{ type: 'number' }, { type: 'null' }] }),
      flag: attribute({ type: 'boolean' }),
    })
    expect(formatType(type, []).text).toBe(
      '{\n  _type: "thing";\n  label?: string;\n  count: number | null;\n  flag: boolean;\n}'
    )
  })

  it('prints null last and bare literals at the top level only', () => {
    const union: TypeNode = {
      type: 'union',
      of: [{ type: 'null' }, { type: 'string', value: 'a' }, { type: 'string', value: 'b' }],
    }
    expect(formatType(union, [], { bareLiterals: true }).text).toBe('a | b | null')
    expect(formatType(union, []).text).toBe('"a" | "b" | null')
    expect(formatType({ type: 'null' }, []).text).toBe('null')
  })

  it('prints arrays of objects and of scalars', () => {
    expect(formatType({ type: 'array', of: string }, []).text).toBe('Array<string>')
    expect(formatType({ type: 'array', of: object({ a: attribute(string) }) }, []).text).toBe(
      'Array<{\n  a: string;\n}>'
    )
    expect(formatType({ type: 'array', of: object({}) }, []).text).toBe('Array<{}>')
  })

  it('expands named types from the schema and keeps the name of an unknown one', () => {
    const schema: SchemaType = [
      { type: 'type', name: 'seo', value: object({ description: attribute(string) }) },
      { type: 'document', name: 'page', attributes: { title: attribute(string) } },
    ]
    expect(formatType({ type: 'inline', name: 'seo' }, schema).text).toBe(
      '{\n  description: string;\n}'
    )
    expect(formatType({ type: 'inline', name: 'page' }, schema).text).toBe('{\n  title: string;\n}')
    expect(formatType({ type: 'inline', name: 'missing' }, schema).text).toBe('missing')
  })

  it('breaks a type that contains itself and says so', () => {
    const schema: SchemaType = [
      {
        type: 'type',
        name: 'category',
        value: object({
          title: attribute(string),
          parent: attribute({ type: 'inline', name: 'category' }, true),
        }),
      },
    ]
    const { text, notes } = formatType({ type: 'inline', name: 'category' }, schema)
    expect(text).toBe('{\n  title: string;\n  parent?: category;\n}')
    expect(notes).toEqual(['A type that contains itself is shown by name where it repeats.'])
  })

  it('collapses objects nested past the depth cap and says so', () => {
    const shallow = formatType(nested(MAX_DEPTH, string), [])
    expect(shallow.notes).toEqual([])

    const { text, notes } = formatType(nested(MAX_DEPTH + 1, string), [])
    expect(text).toContain('child: { … };')
    expect(text.split('\n').length).toBe(MAX_DEPTH * 2 + 1)
    expect(notes).toEqual([
      `Objects nested more than ${MAX_DEPTH} levels deep are shown as \`{ … }\`.`,
    ])
  })

  it('cuts a wide object after the attribute cap and says so', () => {
    const attributes: Record<string, ObjectAttribute> = {}
    for (let index = 0; index < MAX_ATTRIBUTES_PER_OBJECT + 5; index++) {
      attributes[`field${index}`] = attribute(string)
    }
    const { text, notes } = formatType(object(attributes), [])
    expect(text).toContain(`field${MAX_ATTRIBUTES_PER_OBJECT - 1}: string;`)
    expect(text).not.toContain(`field${MAX_ATTRIBUTES_PER_OBJECT}:`)
    expect(text).toContain('… 5 more')
    expect(notes).toEqual([
      `Only the first ${MAX_ATTRIBUTES_PER_OBJECT} attributes of an object are shown.`,
    ])
  })

  it('stops printing after the total cap, however the type branches', () => {
    const leaf = (): TypeNode => {
      const attributes: Record<string, ObjectAttribute> = {}
      for (let index = 0; index < MAX_ATTRIBUTES_PER_OBJECT; index++) {
        attributes[`a${index}`] = attribute(string)
      }
      return object(attributes)
    }
    const attributes: Record<string, ObjectAttribute> = {}
    for (let index = 0; index < 30; index++) {
      attributes[`branch${index}`] = attribute(leaf())
    }
    const { text, notes } = formatType(object(attributes), [])
    expect(text.split('\n').length).toBeLessThan(MAX_TOTAL_ATTRIBUTES * 3)
    expect(text).toMatch(/^ *…$/m)
    expect(notes.join(' ')).toContain(`after ${MAX_TOTAL_ATTRIBUTES} attributes`)
  })

  it('prints a union of objects as the alternatives', () => {
    const { text } = formatTypes(
      [object({ a: attribute(string) }), object({ b: attribute(string) }), { type: 'null' }],
      []
    )
    expect(text).toBe('{\n  a: string;\n} | {\n  b: string;\n} | null')
  })
})

describe('hover notes', () => {
  it('tells the reader what was cut short', () => {
    const schema: SchemaType = [
      {
        type: 'document',
        name: 'page',
        attributes: {
          _type: attribute({ type: 'string', value: 'page' }),
          deep: attribute(nested(MAX_DEPTH + 1, string)),
        },
      },
    ]
    const query = '*[_type == "page"]{deep}'
    const hover = getHoverInfo(
      { query, start: 0, end: query.length, line: 0, column: 0 },
      query.indexOf('deep') + 1,
      { schema }
    )
    const contents = hover?.contents
    const value =
      contents && typeof contents === 'object' && 'value' in contents ? contents.value : ''
    expect(value).toContain('child: { … };')
    expect(value).toContain(
      `_Objects nested more than ${MAX_DEPTH} levels deep are shown as \`{ … }\`._`
    )
  })
})
