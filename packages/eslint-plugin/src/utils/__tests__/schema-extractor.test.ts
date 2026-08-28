import { describe, expect, it } from 'vitest'
import type { TSESTree } from '@typescript-eslint/types'
import { extractSchemaFromDefineType } from '../schema-extractor'

const loc: TSESTree.SourceLocation = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 1 },
}

function stringLiteral(value: string): TSESTree.StringLiteral {
  return { type: 'Literal', value, raw: JSON.stringify(value), loc } as TSESTree.StringLiteral
}

function identifier(name: string): TSESTree.Identifier {
  return { type: 'Identifier', name, loc } as TSESTree.Identifier
}

function property(key: string, value: TSESTree.Node): TSESTree.Property {
  return {
    type: 'Property',
    key: identifier(key),
    value,
    kind: 'init',
    method: false,
    shorthand: false,
    computed: false,
    loc,
  } as TSESTree.Property
}

function objectExpression(properties: TSESTree.Property[]): TSESTree.ObjectExpression {
  return { type: 'ObjectExpression', properties, loc } as TSESTree.ObjectExpression
}

function defineTypeCall(schemaObj: TSESTree.ObjectExpression): TSESTree.CallExpression {
  return {
    type: 'CallExpression',
    callee: identifier('defineType'),
    arguments: [schemaObj],
    optional: false,
    loc,
  } as TSESTree.CallExpression
}

function defineFieldCall(fieldObj: TSESTree.ObjectExpression): TSESTree.CallExpression {
  return {
    type: 'CallExpression',
    callee: identifier('defineField'),
    arguments: [fieldObj],
    optional: false,
    loc,
  } as TSESTree.CallExpression
}

function schemaWithSlugSource(sourceValue: TSESTree.Node): TSESTree.CallExpression {
  return defineTypeCall(
    objectExpression([
      property('name', stringLiteral('navItem')),
      property('type', stringLiteral('object')),
      property('fields', {
        type: 'ArrayExpression',
        elements: [
          defineFieldCall(
            objectExpression([
              property('name', stringLiteral('key')),
              property('type', stringLiteral('slug')),
              property('options', objectExpression([property('source', sourceValue)])),
            ])
          ),
        ],
        loc,
      } as TSESTree.ArrayExpression),
    ])
  )
}

describe('extractSchemaFromDefineType — slug options.source', () => {
  it('extracts string source paths', () => {
    const schema = extractSchemaFromDefineType(schemaWithSlugSource(stringLiteral('title')))
    expect(schema?.fields?.[0]?.options?.source).toBe('title')
  })

  it('accepts arrow function sources (nested parent paths)', () => {
    const arrowSource = {
      type: 'ArrowFunctionExpression',
      params: [
        identifier('_document'),
        objectExpression([]), // { parent } destructuring approximated
      ],
      body: {
        type: 'MemberExpression',
        object: identifier('parent'),
        property: identifier('displayName'),
        computed: false,
        optional: false,
        loc,
      },
      expression: true,
      async: false,
      generator: false,
      id: null,
      loc,
    } as TSESTree.ArrowFunctionExpression

    const schema = extractSchemaFromDefineType(schemaWithSlugSource(arrowSource))
    expect(typeof schema?.fields?.[0]?.options?.source).toBe('function')
  })

  it('accepts function expression sources', () => {
    const fnSource = {
      type: 'FunctionExpression',
      params: [],
      body: { type: 'BlockStatement', body: [], loc },
      async: false,
      generator: false,
      expression: false,
      id: null,
      loc,
    } as unknown as TSESTree.FunctionExpression

    const schema = extractSchemaFromDefineType(schemaWithSlugSource(fnSource))
    expect(typeof schema?.fields?.[0]?.options?.source).toBe('function')
  })

  it('accepts identifier sources (referenced functions)', () => {
    const schema = extractSchemaFromDefineType(schemaWithSlugSource(identifier('slugFromParent')))
    expect(typeof schema?.fields?.[0]?.options?.source).toBe('function')
  })

  it('rejects boolean true as a source (invalid Sanity schema)', () => {
    const boolTrue = {
      type: 'Literal',
      value: true,
      raw: 'true',
      loc,
    } as TSESTree.BooleanLiteral

    const schema = extractSchemaFromDefineType(schemaWithSlugSource(boolTrue))
    expect(schema?.fields?.[0]?.options?.source).toBeUndefined()
  })

  it('does not treat missing source as present', () => {
    const schema = extractSchemaFromDefineType(
      defineTypeCall(
        objectExpression([
          property('name', stringLiteral('navItem')),
          property('type', stringLiteral('object')),
          property('fields', {
            type: 'ArrayExpression',
            elements: [
              defineFieldCall(
                objectExpression([
                  property('name', stringLiteral('key')),
                  property('type', stringLiteral('slug')),
                  property('options', objectExpression([])),
                ])
              ),
            ],
            loc,
          } as TSESTree.ArrayExpression),
        ])
      )
    )
    expect(schema?.fields?.[0]?.options?.source).toBeUndefined()
  })
})
