import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import groqLoader from '@sanity-labs/groq-content-mapper/loader'
import { ContentMapperConfigs } from '../content-mapper/config.js'
import { loadGroqFunctions, withGroqFunctions } from '../content-mapper/functions.js'
import { parseCalls, parseDefinitions } from '../content-mapper/groq-scanner.js'
import { computeQueryDiagnostics } from '../capabilities/diagnostics.js'
import { getHoverInfo } from '../capabilities/hover.js'
import type { GroqQuery } from '../types.js'

const IMAGE_FUNCTIONS = `// Shared image helpers.
fn image::asset($asset) = $asset->{url, metadata};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
`

const AUTHOR_FUNCTIONS = `fn author::summary($author) = $author->{
  // The name and the slug a card shows.
  name,
  "slug": slug.current
};
fn post::card($post) = $post{title, "author": author::summary(author), "image": image::field(mainImage)};
`

const RICH_TEXT_FUNCTION = `fn image::richText($blocks) = $blocks[]{..., _type == "image" => image::field(@)};
`

/** `image::lqip` dereferences `asset` twice in one projection; `image::preview` only calls it. */
const LQIP_FUNCTIONS = `fn image::lqip($image) = $image{"url": asset->url, "lqip": asset->metadata.lqip};
fn image::preview($image) = $image{alt, "src": image::lqip(@)};
`

let project: string

function write(path: string, content: string): string {
  const file = join(project, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

function tsconfig(options: unknown) {
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {},
      contentMappers: [
        { package: '@sanity-labs/groq-content-mapper', extensions: ['.groq'], options },
      ],
    })
  )
}

function queryAt(text: string): GroqQuery {
  return { query: text, start: 0, end: text.length, line: 0, column: 0 }
}

beforeEach(() => {
  project = realpathSync(mkdtempSync(join(tmpdir(), 'groq-lsp-mapper-')))
})

afterEach(() => {
  rmSync(project, { recursive: true, force: true })
})

describe('groq scanner', () => {
  it('reads definitions with the namespaced functions their bodies call', () => {
    const { definitions, problems } = parseDefinitions(IMAGE_FUNCTIONS)
    expect(problems).toEqual([])
    expect(definitions.map(({ name, calls }) => ({ name, calls }))).toEqual([
      { name: 'image::asset', calls: [] },
      { name: 'image::field', calls: ['image::asset'] },
    ])
    expect(IMAGE_FUNCTIONS.slice(definitions[1]?.start, definitions[1]?.end)).toBe(
      'fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};'
    )
  })

  it('ignores calls in strings and comments, and semicolons inside brackets', () => {
    const query = `fn a::b($x) = $x{"s": "c::d(1);"};
// e::f(2)
*[_type == "post"]{"one": a::b(@), "two": g::h(x), 'quoted': 'i::j()'}`
    expect(parseCalls(query)).toEqual({ calls: ['a::b', 'g::h'], defines: ['a::b'] })
  })

  it('reports what is not a definition and keeps the rest', () => {
    const { definitions, problems } = parseDefinitions(
      '*[_type == "post"];\nfn ok::one($x) = $x{a};\nfn broken = 1;'
    )
    expect(definitions.map((d) => d.name)).toEqual(['ok::one'])
    expect(problems.map((p) => p.message)).toEqual([
      'Expected a "fn" definition',
      'Expected "fn namespace::name($param) = ...;"',
    ])
  })
})

describe('custom GROQ functions', () => {
  it('prepends what a query calls, dependencies first, each once', () => {
    write('groq/image.groq', IMAGE_FUNCTIONS)
    write('groq/author.groq', AUTHOR_FUNCTIONS)
    const { functions, issues } = loadGroqFunctions(['groq/*.groq'], project)
    expect(issues).toEqual([])

    const query = '*[_type == "post"][0]{"card": post::card(@), "image": image::field(mainImage)}'
    const prepended = withGroqFunctions(query, functions)
    const names = [...prepended.matchAll(/^fn (\S+)\(/gm)].map((match) => match[1])
    expect(names).toEqual(['author::summary', 'image::asset', 'image::field', 'post::card'])
    expect(prepended.endsWith(`\n${query}`)).toBe(true)
  })

  it('leaves out functions the query defines itself or never calls', () => {
    write('groq/image.groq', IMAGE_FUNCTIONS)
    const { functions } = loadGroqFunctions('groq/image.groq', project)
    const own = 'fn image::field($image) = $image{crop};\n*[0]{"i": image::field(x)}'
    expect(withGroqFunctions(own, functions)).toBe(own)
    expect(withGroqFunctions('*[_type == "post"]', functions)).toBe('*[_type == "post"]')
  })

  it('reports missing files, empty globs, duplicates and invalid definitions', () => {
    write('groq/image.groq', IMAGE_FUNCTIONS)
    write('groq/again.groq', 'fn image::asset($a) = $a{url};')
    write('groq/bad.groq', 'fn bad::body($a) = 1;\nfn bad::caller($a) = $a{"x": bad::body(a)};')
    const { functions, issues } = loadGroqFunctions(
      ['groq/*.groq', 'missing.groq', 'none/*.groq'],
      project
    )
    expect(issues).toEqual([
      `No functions file at ${join(project, 'missing.groq')}.`,
      '"none/*.groq" matches no functions files.',
      `The function image::asset is defined twice: in ${join(project, 'groq/again.groq')} and in ${join(project, 'groq/image.groq')}.`,
      expect.stringMatching(/^Invalid function definition bad::body in /),
    ])
    expect([...functions.keys()].sort()).toEqual(['image::asset', 'image::field'])
  })

  it('prepends exactly what the groq-content-mapper loader prepends', () => {
    tsconfig({ schema: './schema.json', functions: ['groq/*.groq'], minify: false })
    write('groq/image.groq', IMAGE_FUNCTIONS)
    write('groq/author.groq', AUTHOR_FUNCTIONS)
    const queries = [
      '*[_type == "post"]',
      '*[_type == "post"][0]{title, "image": image::field(mainImage)}',
      '// a card\n*[_type == "post"]{...post::card(@)}\n',
      'fn image::asset($a) = $a{url};\n*[0]{"i": image::field(x), "s": "post::card(1)"}',
    ]
    const configs = new ContentMapperConfigs()
    for (const [index, query] of queries.entries()) {
      const file = write(`queries/q${index}.groq`, query)
      const module = groqLoader.call(
        { resourcePath: file, addDependency: () => undefined },
        query
      ) as string
      const delivered = JSON.parse(module.replace(/^export default /, '').trim()) as string
      const functions = configs.forFile(file)?.functions?.functions ?? new Map()
      expect(withGroqFunctions(query, functions)).toBe(delivered)
    }
  })
})

describe('content mapper config', () => {
  it('reads the nearest tsconfig.json and picks the deepest schemas folder', () => {
    tsconfig({
      schema: './schema.json',
      schemas: [
        { include: 'src/queries/blog', schema: 'schemas/blog.json' },
        { include: ['src/**/shop/*.groq'], schema: 'schemas/shop.json' },
        { include: 'src', schema: 'schemas/src.json' },
      ],
    })
    const configs = new ContentMapperConfigs()
    const at = (path: string) =>
      configs.forFile(join(project, path))?.schemaFor(join(project, path))

    expect(at('src/queries/blog/posts.groq')).toBe(join(project, 'schemas/blog.json'))
    expect(at('src/queries/other.ts')).toBe(join(project, 'schemas/src.json'))
    // As deep as `src`, and listed first.
    expect(at('src/eu/shop/products.groq')).toBe(join(project, 'schemas/shop.json'))
    expect(at('scripts/one.groq')).toBe(join(project, 'schema.json'))

    const config = configs.forFile(join(project, 'a.groq'))
    expect(config?.handles(join(project, 'a.groq'))).toBe(true)
    expect(config?.handles(join(project, 'a.ts'))).toBe(false)
    expect(config?.issues).toEqual([])
  })

  it('has no config without the mapper entry, and reports malformed options', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    const configs = new ContentMapperConfigs()
    expect(configs.forFile(join(project, 'a.groq'))).toBeUndefined()

    tsconfig({ schema: 3, schemas: [{ include: 'src' }], functions: [] })
    configs.invalidate()
    const config = configs.forFile(join(project, 'a.groq'))
    expect(config?.schemaFor(join(project, 'src/a.groq'))).toBeUndefined()
    expect(config?.issues).toHaveLength(3)
  })

  it('reads the config again when the tsconfig or a functions file changes', () => {
    tsconfig({ schema: './one.json', functions: 'fns.groq' })
    const fns = write('fns.groq', 'fn a::one($x) = $x{a};')
    const configs = new ContentMapperConfigs()
    const file = join(project, 'q.groq')
    expect([...(configs.forFile(file)?.functions?.functions.keys() ?? [])]).toEqual(['a::one'])

    writeFileSync(fns, 'fn a::two($x) = $x{a};')
    utimesSync(fns, new Date(), new Date(Date.now() + 5000))
    expect([...(configs.forFile(file)?.functions?.functions.keys() ?? [])]).toEqual(['a::two'])

    tsconfig({ schema: './two.json' })
    utimesSync(join(project, 'tsconfig.json'), new Date(), new Date(Date.now() + 10_000))
    expect(configs.forFile(file)?.schemaFor(file)).toBe(join(project, 'two.json'))
  })
})

function functions() {
  write('groq/image.groq', IMAGE_FUNCTIONS)
  return loadGroqFunctions('groq/image.groq', project).functions
}

describe('diagnostics and hover with shared functions', () => {
  it('lints a query that calls a shared function without a parse error', () => {
    const query = queryAt('*[_type == "post"][0]{title, "image": image::field(mainImage)}')
    expect(computeQueryDiagnostics(query).parseError).toMatch(/image/)
    expect(computeQueryDiagnostics(query, { functions: functions() })).toEqual({
      query,
      diagnostics: [],
    })
  })

  it('reports findings at their place in the query, not in the prepended definitions', () => {
    const byBob = '\n  "byBob": *[author->name == "Bob"]\n}'
    const query = queryAt(`*[_type == "post"]{\n  "image": image::field(mainImage),${byBob}`)
    const plain = computeQueryDiagnostics(
      queryAt(`*[_type == "post"]{\n  "image": mainImage,${byBob}`)
    )
    const { diagnostics, parseError } = computeQueryDiagnostics(query, { functions: functions() })
    expect(parseError).toBeUndefined()
    const joins = diagnostics.filter((d) => d.code === 'join-in-filter')
    expect(joins).toHaveLength(1)
    expect(joins[0]?.range).toEqual(
      plain.diagnostics.find((d) => d.code === 'join-in-filter')?.range
    )
  })

  it('leaves findings in prepended function bodies out of the calling query', () => {
    write('groq/image.groq', LQIP_FUNCTIONS)
    const { functions } = loadGroqFunctions('groq/image.groq', project)
    const query = queryAt(
      '*[_type == "page"][0]{\n  title,\n  "image": image::preview(mainImage)\n}'
    )
    expect(computeQueryDiagnostics(query, { functions })).toEqual({ query, diagnostics: [] })
  })

  it('keeps the calling query’s own span-less findings', () => {
    write('groq/image.groq', LQIP_FUNCTIONS)
    const { functions } = loadGroqFunctions('groq/image.groq', project)
    const own = '"name": author->name, "bio": author->bio'
    const query = queryAt(`*[_type == "post"][0]{${own}, "image": image::preview(mainImage)}`)
    const { diagnostics } = computeQueryDiagnostics(query, { functions })
    const repeated = diagnostics.filter((d) => d.code === 'repeated-dereference')
    expect(repeated.map((d) => d.message)).toEqual([
      expect.stringMatching(/^Reference 'author' is dereferenced 2 times/),
    ])
    // Without a span, the finding covers the query, as it does without functions.
    expect(repeated[0]?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: query.query.length },
    })
  })

  it('does not report nested image helpers as a repeated dereference', () => {
    write('groq/image.groq', `${IMAGE_FUNCTIONS}${RICH_TEXT_FUNCTION}`)
    const { functions } = loadGroqFunctions('groq/image.groq', project)
    const query = queryAt(
      '*[_type == "page" && slug.current == $slug][0]{\n  title,\n  "image": image::field(mainImage),\n  "body": image::richText(body)\n}'
    )
    expect(computeQueryDiagnostics(query, { functions })).toEqual({ query, diagnostics: [] })
  })

  it('reports a finding in a function body on that definition in its functions file', () => {
    const text = `${IMAGE_FUNCTIONS}${LQIP_FUNCTIONS}`
    const query = { ...queryAt(text), line: 3, column: 2 }
    const { diagnostics } = computeQueryDiagnostics(query, { functions: functions() })
    const repeated = diagnostics.filter((d) => d.code === 'repeated-dereference')
    const name = text.split('\n').findIndex((line) => line.startsWith('fn image::lqip('))
    expect(repeated.map((d) => d.range)).toEqual([
      {
        start: { line: 3 + name, character: 3 },
        end: { line: 3 + name, character: 3 + 'image::lqip'.length },
      },
    ])
  })

  it('reports a finding in a function the query defines on its definition, not the query', () => {
    const text = `${LQIP_FUNCTIONS.split('\n')[0]}\n*[_type == "page"][0]{"image": image::lqip(mainImage)}`
    const { diagnostics } = computeQueryDiagnostics(queryAt(text))
    expect(diagnostics.map(({ code, range }) => ({ code, range }))).toEqual([
      {
        code: 'repeated-dereference',
        range: { start: { line: 0, character: 3 }, end: { line: 0, character: 14 } },
      },
    ])
  })

  it('reports a finding in a body that calls a GROQ built-in on its definition', () => {
    const text = `fn post::card($post) = $post{"text": pt::text(body), "a": author->name, "b": author->bio};
*[_type == "post"][0]{"card": post::card(@)}`
    const { diagnostics } = computeQueryDiagnostics(queryAt(text))
    expect(diagnostics.map(({ code, range }) => ({ code, range }))).toEqual([
      {
        code: 'repeated-dereference',
        range: { start: { line: 0, character: 3 }, end: { line: 0, character: 13 } },
      },
    ])
  })

  it('hovers in a query that calls a shared function', () => {
    const text = '*[_type == "post"]{"image": image::field(mainImage), _id}'
    const offset = text.indexOf('_id')
    expect(getHoverInfo(queryAt(text), offset)).toBeNull()
    expect(getHoverInfo(queryAt(text), offset, { functions: functions() })).not.toBeNull()
  })
})
