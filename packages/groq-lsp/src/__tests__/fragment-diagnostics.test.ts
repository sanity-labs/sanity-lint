import { describe, it, expect } from 'vitest'
import type { SchemaType } from 'groq-js'
import { computeDocumentDiagnostics } from '../capabilities/diagnostics'
import { resolveQueryFragments, resolveTemplates } from '../fragments/index'
import type { FragmentHost } from '../fragments/types'
import { extractQueries } from '../utils/groq-extractor'

const schema: SchemaType = [
  {
    type: 'document',
    name: 'article',
    attributes: {
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'article' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
]

function hostOf(files: Record<string, string>): FragmentHost {
  return { readFile: async (file) => files[file] }
}

async function diagnose(content: string, files: Record<string, string> = {}) {
  const { queries } = extractQueries(content, 'typescript')
  const resolved = await resolveQueryFragments(content, '/app/query.ts', queries, hostOf(files))
  return computeDocumentDiagnostics(resolved, { schema })
}

describe('extractQueries', () => {
  it('marks templates with interpolations, not escaped ones', () => {
    const { queries } = extractQueries('groq`*{${a}}`\ngroq`*{"\\${a}"}`\ngroq`*`', 'typescript')
    expect(queries.map((query) => query.interpolated)).toEqual([true, undefined, undefined])
  })
})

describe('resolveTemplates', () => {
  it('inlines the fragments of the templates at the given offsets', async () => {
    const source = 'const f = groq`name`\nconst q = groq`*{${f}, title}`'
    const start = source.lastIndexOf('`*')
    expect(await resolveTemplates(source, '/app/q.ts', [start], hostOf({}))).toEqual([
      '*{name, title}',
    ])
  })

  it('gives undefined for a template with a fragment it cannot resolve', async () => {
    const source = 'groq`*{${unknown}}`'
    expect(await resolveTemplates(source, '/app/q.ts', [4], hostOf({}))).toEqual([undefined])
  })
})

describe('diagnostics of interpolated queries', () => {
  it('lints the query with its fragments inlined instead of reporting a parse error', async () => {
    const content = [
      "import {author} from './fragments'",
      'const query = defineQuery(`*[_type == "article"]{ author->${author} }`)',
    ].join('\n')
    const files = { '/app/fragments.ts': 'export const author = defineQuery(`{ name }`)' }
    expect(await diagnose(content, files)).toEqual([])
  })

  it('reports findings on the template as written', async () => {
    const content = 'const f = groq`title`\nconst q = groq`*[_type == "missing"]{${f}}`'
    const [diagnostic] = await diagnose(content)
    expect(diagnostic?.code).toEqual('invalid-type-filter')
    const template = '*[_type == "missing"]{${f}}'
    const column = (content.split('\n')[1] ?? '').indexOf(template)
    expect(diagnostic?.range).toEqual({
      start: { line: 1, character: column },
      end: { line: 1, character: column + template.length },
    })
  })

  it('reports a parse error from a fragment on the query that uses it', async () => {
    const content = 'const f = groq`title,,`\nconst q = groq`*{${f}}`'
    const diagnostics = await diagnose(content)
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining('Parse error'),
      expect.stringContaining('Parse error'),
    ])
  })

  it('leaves out queries with fragments it cannot resolve', async () => {
    expect(await diagnose('const q = groq`*[_type == "article"]{${fromSomewhere()}}`')).toEqual([])
  })
})
