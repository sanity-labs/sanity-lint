import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Linter } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sanity from '../index'
import { clearSchemaCache } from '../utils/schema-cache'

const literal = (value: string) => ({ type: 'objectAttribute', value: { type: 'string', value } })

const keyed = (name: string) => ({
  type: 'object',
  attributes: { _key: { type: 'objectAttribute', value: { type: 'string' } } },
  rest: { type: 'inline', name },
})

const schema = [
  {
    type: 'type',
    name: 'textBlock',
    value: { type: 'object', attributes: { _type: literal('textBlock') } },
  },
  {
    type: 'type',
    name: 'imageBlock',
    value: { type: 'object', attributes: { _type: literal('imageBlock') } },
  },
  {
    type: 'document',
    name: 'post',
    attributes: {
      _type: literal('post'),
      content: {
        type: 'objectAttribute',
        value: {
          type: 'array',
          of: { type: 'union', of: [keyed('textBlock'), keyed('imageBlock')] },
        },
        optional: true,
      },
    },
  },
]

describe('sanity/groq-invalid-type-filter', () => {
  let dir: string
  let linter: Linter
  let config: Linter.Config[]

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sanity-eslint-'))
    const schemaPath = join(dir, 'schema.json')
    writeFileSync(schemaPath, JSON.stringify(schema))
    clearSchemaCache()
    linter = new Linter({ cwd: dir })
    config = [
      {
        files: ['**/*.js'],
        plugins: { sanity: { rules: sanity.rules } },
        settings: { sanity: { schemaPath } },
        rules: { 'sanity/groq-invalid-type-filter': 'error' },
      },
    ]
  })

  afterAll(() => {
    clearSchemaCache()
    rmSync(dir, { recursive: true, force: true })
  })

  const lintQuery = (query: string) =>
    linter.verify(`const q = groq\`${query}\``, config, { filename: join(dir, 'query.js') })

  it('does not flag _type filters on array items (#27)', () => {
    const messages = lintQuery('*[_type == "post"]{ "images": content[_type == "imageBlock"] }')
    expect(messages).toEqual([])
  })

  it('flags unknown document types', () => {
    const messages = lintQuery('*[_type == "imageBlock"]')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.ruleId).toBe('sanity/groq-invalid-type-filter')
    expect(messages[0]?.message).toContain('Document type "imageBlock" does not exist in schema')
  })

  it('flags types that are not allowed in the array', () => {
    const messages = lintQuery('*[_type == "post"]{ "images": content[_type == "imageBlok"] }')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain('Type "imageBlok" is not a possible type here')
  })
})
