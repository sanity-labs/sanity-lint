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

  it('prints number and boolean literals as literals, as codegen does', () => {
    expect(formatType({ type: 'number', value: 3 }, []).text).toBe('3')
    expect(formatType({ type: 'boolean', value: false }, []).text).toBe('false')
    const union: TypeNode = {
      type: 'union',
      of: [{ type: 'number', value: 1 }, { type: 'number', value: 2 }, { type: 'null' }],
    }
    expect(formatType(union, []).text).toBe('1 | 2 | null')
  })

  describe('booleans', () => {
    const isTrue: TypeNode = { type: 'boolean', value: true }
    const isFalse: TypeNode = { type: 'boolean', value: false }

    it('prints a plain boolean as boolean', () => {
      expect(formatType({ type: 'boolean' }, []).text).toBe('boolean')
    })

    it('prints a lone true or false as the literal', () => {
      expect(formatType(isTrue, []).text).toBe('true')
      expect(formatType(isFalse, []).text).toBe('false')
      expect(formatType({ type: 'union', of: [isTrue, isTrue] }, []).text).toBe('true')
    })

    it('prints true and false together as boolean, in either order', () => {
      expect(formatType({ type: 'union', of: [isFalse, isTrue] }, []).text).toBe('boolean')
      expect(formatType({ type: 'union', of: [isTrue, isFalse] }, []).text).toBe('boolean')
    })

    it('collapses true and false inside a larger union', () => {
      const union: TypeNode = { type: 'union', of: [isTrue, isFalse, { type: 'null' }] }
      expect(formatType(union, []).text).toBe('boolean | null')
      const mixed: TypeNode = { type: 'union', of: [isTrue, string, isFalse] }
      expect(formatType(mixed, []).text).toBe('boolean | string')
      const nestedUnion: TypeNode = {
        type: 'union',
        of: [{ type: 'union', of: [isFalse, { type: 'null' }] }, isTrue],
      }
      expect(formatType(nestedUnion, []).text).toBe('boolean | null')
    })

    it('keeps a literal beside other types when only one of true and false is there', () => {
      const union: TypeNode = { type: 'union', of: [isTrue, { type: 'null' }] }
      expect(formatType(union, []).text).toBe('true | null')
    })

    it('collapses true and false in a nested object field', () => {
      const type = object({
        inner: attribute(
          object({
            flag: attribute({ type: 'union', of: [isTrue, isFalse] }),
            only: attribute(isTrue),
          })
        ),
        maybe: attribute({ type: 'union', of: [isFalse, isTrue, { type: 'null' }] }, true),
      })
      expect(formatType(type, []).text).toBe(
        '{\n  inner: {\n    flag: boolean;\n    only: true;\n  };\n  maybe?: boolean | null;\n}'
      )
    })
  })

  it('prints an empty union as never, as codegen does', () => {
    const never: TypeNode = { type: 'union', of: [] }
    expect(formatType(never, []).text).toBe('never')
    expect(formatType({ type: 'array', of: never }, []).text).toBe('Array<never>')
    expect(formatType(object({ listItem: attribute(never, true) }), []).text).toBe(
      '{\n  listItem?: never;\n}'
    )
  })

  it('quotes a key that is not an identifier, as codegen does', () => {
    const type = object({
      'my title': attribute(string),
      título: attribute(string),
      $id: attribute(string),
    })
    expect(formatType(type, []).text).toBe(
      '{\n  "my title": string;\n  título: string;\n  $id: string;\n}'
    )
  })

  it('expands named types from the schema and prints one it does not have as unknown', () => {
    const schema: SchemaType = [
      { type: 'type', name: 'seo', value: object({ description: attribute(string) }) },
      { type: 'document', name: 'page', attributes: { title: attribute(string) } },
    ]
    expect(formatType({ type: 'inline', name: 'seo' }, schema).text).toBe(
      '{\n  description: string;\n}'
    )
    expect(formatType({ type: 'inline', name: 'page' }, schema).text).toBe('{\n  title: string;\n}')
    expect(formatType({ type: 'inline', name: 'missing' }, schema).text).toBe('unknown')
  })

  it('gives the items of an array of named types the _key of ArrayOf, as codegen does', () => {
    const schema: SchemaType = [
      {
        type: 'type',
        name: 'link',
        value: object({ href: attribute(string), _key: attribute(string, true) }),
      },
      {
        type: 'type',
        name: 'reference',
        value: object({
          _ref: attribute(string),
          _type: attribute({ type: 'string', value: 'reference' }),
        }),
      },
    ]
    const link: TypeNode = { type: 'inline', name: 'link' }
    const reference: TypeNode = { type: 'inline', name: 'reference' }
    expect(formatType({ type: 'array', of: reference }, schema).text).toBe(
      'Array<{\n  _key: string;\n  _ref: string;\n  _type: "reference";\n}>'
    )
    expect(
      formatType({ type: 'array', of: { type: 'union', of: [link, reference] } }, schema).text
    ).toBe(
      'Array<{\n  href: string;\n  _key: string;\n} | {\n  _key: string;\n  _ref: string;\n  _type: "reference";\n}>'
    )
    expect(
      formatType(
        { type: 'array', of: { type: 'union', of: [object({ a: attribute(string) }), link] } },
        schema
      ).text
    ).toBe('Array<{\n  a: string;\n}> | Array<{\n  href: string;\n  _key: string;\n}>')
    expect(formatType(object({ items: attribute({ type: 'array', of: link }) }), schema).text).toBe(
      '{\n  items: Array<{\n    href: string;\n    _key: string;\n  }>;\n}'
    )
  })

  it('folds the attributes of the rest of an object into it', () => {
    const schema: SchemaType = [
      {
        type: 'type',
        name: 'reference',
        value: {
          type: 'object',
          attributes: {
            _ref: attribute(string),
            _type: attribute({ type: 'string', value: 'reference' }),
          },
          rest: { type: 'inline', name: 'weak' },
        },
      },
      {
        type: 'type',
        name: 'weak',
        value: object({ _weak: attribute({ type: 'boolean' }, true) }),
      },
      {
        type: 'type',
        name: 'loop',
        value: { type: 'object', attributes: {}, rest: { type: 'inline', name: 'loop' } },
      },
    ]
    const item: TypeNode = {
      type: 'object',
      attributes: { _key: attribute(string), _type: attribute({ type: 'string', value: 'item' }) },
      rest: { type: 'inline', name: 'reference' },
    }
    expect(formatType(item, schema).text).toBe(
      '{\n  _key: string;\n  _type: "item";\n  _ref: string;\n  _weak?: boolean;\n}'
    )
    const inline: TypeNode = {
      type: 'object',
      attributes: {},
      rest: object({ a: attribute(string) }),
    }
    expect(formatType(inline, schema).text).toBe('{\n  a: string;\n}')
    expect(formatType({ type: 'inline', name: 'loop' }, schema).text).toBe('{}')
  })

  it('prints an object whose other attributes are unknown as unknown, as codegen does', () => {
    const open: TypeNode = {
      type: 'object',
      attributes: { title: attribute(string) },
      rest: { type: 'unknown' },
    }
    expect(formatType(open, []).text).toBe('unknown')
    const missing: TypeNode = {
      type: 'object',
      attributes: { title: attribute(string) },
      rest: { type: 'inline', name: 'nope' },
    }
    expect(formatType(missing, []).text).toBe('unknown')
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

  it('keeps the _key of ArrayOf on an item shown by name where its type repeats', () => {
    const schema: SchemaType = [
      {
        type: 'type',
        name: 'category',
        value: object({
          title: attribute(string),
          children: attribute({ type: 'array', of: { type: 'inline', name: 'category' } }, true),
        }),
      },
    ]
    expect(formatType({ type: 'inline', name: 'category' }, schema).text).toBe(
      '{\n  title: string;\n  children?: Array<category & {\n    _key: string;\n  }>;\n}'
    )
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
