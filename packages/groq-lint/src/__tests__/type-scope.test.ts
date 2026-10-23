import { describe, expect, it } from 'vitest'
import { parse, type ExprNode, type SchemaType, type TypeNode } from 'groq-js'
import {
  ROOT_SCOPE,
  SchemaTypeResolver,
  nestedScope,
  walkScoped,
  type TypeScope,
} from '../type-scope'

const str = (value?: string): TypeNode =>
  value === undefined ? { type: 'string' } : { type: 'string', value }
const attr = (value: TypeNode) => ({ type: 'objectAttribute' as const, value })
const inline = (name: string): TypeNode => ({ type: 'inline', name })

const schema: SchemaType = [
  { type: 'type', name: 'a', value: { type: 'object', attributes: { _type: attr(str('a')) } } },
  { type: 'type', name: 'b', value: { type: 'object', attributes: { _type: attr(str('b')) } } },
  { type: 'type', name: 'loop', value: inline('loop') },
  { type: 'type', name: 'alias', value: inline('a') },
  {
    type: 'type',
    name: 'unknownRest',
    value: { type: 'object', attributes: {}, rest: { type: 'unknown' } },
  },
  {
    type: 'type',
    name: 'ref',
    value: {
      type: 'object',
      attributes: { _ref: attr(str()), _type: attr(str('reference')) },
      dereferencesTo: 'doc',
    },
  },
  {
    type: 'document',
    name: 'doc',
    attributes: {
      _type: attr(str('doc')),
      items: attr({ type: 'array', of: { type: 'union', of: [inline('a'), inline('b')] } }),
      maybeItems: attr({
        type: 'union',
        of: [{ type: 'null' }, { type: 'array', of: inline('a') }],
      }),
      groups: attr({
        type: 'array',
        of: {
          type: 'object',
          attributes: {
            entries: attr({ type: 'array', of: inline('b') }),
            single: attr(inline('a')),
          },
        },
      }),
      refs: attr({ type: 'array', of: inline('ref') }),
      mixed: attr({ type: 'union', of: [inline('ref'), str()] }),
      onlyNull: attr({ type: 'union', of: [{ type: 'null' }] }),
      dangling: attr(inline('missing')),
      refOrNull: attr({ type: 'union', of: [{ type: 'null' }, inline('ref')] }),
      extended: attr({ type: 'object', attributes: {}, rest: inline('ref') }),
      loose: attr({ type: 'object', attributes: {}, rest: { type: 'unknown' } }),
      plain: attr({ type: 'object', attributes: {} }),
      count: attr({ type: 'number' }),
    },
  },
  { type: 'document', name: 'other', attributes: { _type: attr(str('other')) } },
]

const resolver = new SchemaTypeResolver(schema)
const docScope = nestedScope(ROOT_SCOPE, inline('doc'))
const resolve = (query: string, scope: TypeScope = docScope) =>
  resolver.resolve(parse(query), scope)
const names = (query: string, scope: TypeScope = docScope) => {
  const type = resolve(query, scope)
  return type && resolver.possibleTypeNames(type)
}
const elementNames = (query: string) => {
  const type = resolve(query)
  const element = type && resolver.elementType(type)
  return element && resolver.possibleTypeNames(element)
}

describe('SchemaTypeResolver', () => {
  it('lists document types', () => {
    expect(resolver.documentTypes).toEqual(['doc', 'other'])
    expect(elementNames('*')).toEqual(['doc', 'other'])
  })

  it('resolves array members through filters, slices, groups and coercions', () => {
    expect(elementNames('items')).toEqual(['a', 'b'])
    expect(elementNames('items[_type == "a"]')).toEqual(['a', 'b'])
    expect(elementNames('items[0...2]')).toEqual(['a', 'b'])
    expect(elementNames('(items)')).toEqual(['a', 'b'])
    expect(elementNames('items[]')).toEqual(['a', 'b'])
    expect(names('items[0]')).toEqual(['a', 'b'])
    expect(elementNames('maybeItems')).toEqual(['a'])
  })

  it('resolves maps and flat maps', () => {
    expect(elementNames('items[]{...}')).toBeUndefined()
    expect(elementNames('items[]._type')).toBeUndefined()
    expect(elementNames('groups[].entries[]')).toEqual(['b'])
    expect(elementNames('groups[].single')).toEqual(['a'])
    expect(elementNames('refs[]->')).toEqual(['doc'])
    expect(elementNames('groups[].missing->')).toBeUndefined()
    expect(elementNames('count[].x')).toBeUndefined()
    expect(elementNames('groups[].single[]')).toBeUndefined()
    expect(resolve('count[_type == "a"]')).toBeUndefined()
    expect(resolve('plain[]')).toBeUndefined()
  })

  it('resolves dereferences', () => {
    expect(names('refOrNull->')).toEqual(['doc'])
    expect(names('extended->')).toEqual(['doc'])
    expect(names('plain->')).toBeUndefined()
    expect(names('count->')).toBeUndefined()
    expect(names('loose->')).toBeUndefined()
    expect(names('mixed->')).toBeUndefined()
    expect(names('onlyNull->')).toBeUndefined()
    expect(names('dangling->')).toBeUndefined()
  })

  it('resolves attributes on unions, rests and missing attributes', () => {
    expect(resolve('refOrNull._ref')).toEqual({ type: 'union', of: [str()] })
    expect(resolve('extended._ref')).toEqual(str())
    expect(resolve('plain.missing')).toEqual({ type: 'null' })
    expect(resolve('loose.anything')).toBeUndefined()
    expect(resolve('count.anything')).toBeUndefined()
    expect(
      resolve('x', nestedScope(ROOT_SCOPE, { type: 'union', of: [{ type: 'null' }] }))
    ).toBeUndefined()
    expect(
      resolve('x', nestedScope(ROOT_SCOPE, { type: 'union', of: [str(), inline('a')] }))
    ).toBeUndefined()
  })

  it('returns undefined for unknown expressions and scopes', () => {
    expect(resolve('$param')).toBeUndefined()
    expect(resolve('@', ROOT_SCOPE)).toBeUndefined()
    expect(resolve('^', docScope)).toBeUndefined()
    expect(resolve('^.^', docScope)).toBeUndefined()
    expect(resolve('count[0]')).toBeUndefined()
    expect(resolve('nothing', nestedScope(ROOT_SCOPE, inline('missing')))).toBeUndefined()
    expect(resolve('nothing', nestedScope(ROOT_SCOPE, inline('loop')))).toBeUndefined()
    expect(resolve('nothing', nestedScope(ROOT_SCOPE, inline('alias')))).toEqual({ type: 'null' })
  })

  it('computes possible type names', () => {
    const possible = (type: TypeNode) => resolver.possibleTypeNames(type)
    expect(possible(inline('a'))).toEqual(['a'])
    expect(possible(inline('alias'))).toEqual(['a'])
    expect(possible(inline('missing'))).toBeUndefined()
    expect(possible(inline('loop'))).toBeUndefined()
    expect(possible(inline('unknownRest'))).toBeUndefined()
    expect(possible({ type: 'object', attributes: {} })).toBeUndefined()
    expect(possible({ type: 'object', attributes: { _type: attr(str()) } })).toBeUndefined()
    expect(possible({ type: 'union', of: [{ type: 'null' }] })).toBeUndefined()
    expect(possible({ type: 'union', of: [inline('a'), str()] })).toBeUndefined()
    expect(possible({ type: 'union', of: [inline('a'), inline('a'), { type: 'null' }] })).toEqual([
      'a',
    ])
    expect(possible(str())).toBeUndefined()
  })

  it('returns undefined element types for non-arrays', () => {
    expect(resolver.elementType(str())).toBeUndefined()
    expect(resolver.elementType(inline('missing'))).toBeUndefined()
    expect(resolver.elementType({ type: 'union', of: [{ type: 'null' }] })).toBeUndefined()
    expect(resolver.elementType({ type: 'union', of: [str()] })).toBeUndefined()
  })
})

describe('walkScoped', () => {
  const scopesOf = (query: string) => {
    const seen: { node: ExprNode; scope: TypeScope }[] = []
    walkScoped(parse(query), resolver, (node, scope) => seen.push({ node, scope }))
    return seen
  }
  const typeAccessScopes = (query: string) =>
    scopesOf(query)
      .filter(({ node }) => node.type === 'AccessAttribute' && node.name === '_type' && !node.base)
      .map(({ scope }) => scope.type && resolver.possibleTypeNames(scope.type))

  it('visits every child node type', () => {
    const query = `*[_type == "doc" && !(_type == "x") || -count > +count]{
      "arr": [_type, ...items],
      ...plain,
      _type == "doc" => { "s": select(_type == "a" => 1, _type) },
      "f": coalesce(_type, "x"),
      "r": count in 1..2,
      "e": items[0]._type,
      "sl": items[0...1],
      "d": refOrNull->_type,
      "t": (_type)
    } | order(_type asc, count desc)`
    const types = new Set(scopesOf(query).map(({ node }) => node.type))
    for (const type of [
      'PipeFuncCall',
      'Map',
      'Projection',
      'Filter',
      'Or',
      'And',
      'Not',
      'Neg',
      'Pos',
      'Array',
      'Object',
      'Select',
      'FuncCall',
      'InRange',
      'AccessElement',
      'Slice',
      'Deref',
      'Group',
      'Asc',
      'Desc',
      'Everything',
      'Value',
    ]) {
      expect(types).toContain(type)
    }
  })

  it('visits tuples', () => {
    const types = scopesOf('*[(_type, _id) == ("a", "b")]').map(({ node }) => node.type)
    expect(types).toContain('Tuple')
  })

  it('tracks scopes for filters, projections, maps and pipe functions', () => {
    expect(typeAccessScopes('*[_type == "doc"]')).toEqual([['doc', 'other']])
    expect(typeAccessScopes('*[_type == "doc"][0]{ "x": items[_type == "a"] }')).toEqual([
      ['doc', 'other'],
      ['a', 'b'],
    ])
    expect(typeAccessScopes('*[0]{ "x": items[]{ _type } }')).toEqual([['a', 'b']])
    expect(typeAccessScopes('*[0].items | order(_type)')).toEqual([['a', 'b']])
    expect(typeAccessScopes('_type')).toEqual([undefined])
  })

  it('resolves ^ through hidden map scopes like groq-js', () => {
    const parentTypes = scopesOf('*[0]{ "x": items[]{ "p": ^ } }')
      .filter(({ node }) => node.type === 'Parent')
      .map(({ node, scope }) => {
        const type = resolver.resolve(node, scope)
        return type && resolver.possibleTypeNames(type)
      })
    expect(parentTypes).toEqual([['doc', 'other']])
  })
})
