import { describe, it, expect } from 'vitest'
import { resolveEmbeddedQueries } from '../fragments/resolve'
import type { FragmentHost } from '../fragments/types'

function hostOf(files: Record<string, string>): FragmentHost {
  return { readFile: async (file) => files[file] }
}

async function contents(source: string, files: Record<string, string> = {}) {
  const queries = await resolveEmbeddedQueries(source, '/app/src/query.ts', hostOf(files))
  return queries.map((query) => query.content)
}

describe('resolveEmbeddedQueries', () => {
  it('keeps a query without interpolation as written', async () => {
    expect(await contents('const q = groq`*[_type == "post"]`')).toEqual(['*[_type == "post"]'])
    expect(await contents('defineQuery(\'*[_type == "post"]\')')).toEqual(['*[_type == "post"]'])
    expect(await contents('defineQuery(`*[_type == "post"]`)')).toEqual(['*[_type == "post"]'])
  })

  it('reports where the query starts', async () => {
    const source = 'const a = 1\nconst q = groq`*`'
    const [query] = await resolveEmbeddedQueries(source, '/app/q.ts', hostOf({}))
    expect(query.offset).toEqual(source.indexOf('groq'))
  })

  it('inlines fragments from the issue example', async () => {
    const source = [
      'const image = groq`',
      '"image": image{',
      '  ...,',
      '  "asset": asset->,',
      '}',
      '`',
      'const CONTACT_US_PAGE = groq`',
      "*[_id == 'contactUsPage'][0]{",
      '  ...,',
      '  ${image}',
      '}`',
    ].join('\n')
    const queries = await contents(source)
    expect(queries.length).toEqual(2)
    expect(queries[1]).toEqual(
      [
        "\n*[_id == 'contactUsPage'][0]{",
        '  ...,',
        '  \n"image": image{',
        '  ...,',
        '  "asset": asset->,',
        '}\n',
        '}',
      ].join('\n')
    )
  })

  it('inlines fragments written as plain strings, with comments and type annotations', async () => {
    const source = [
      'export const fragmentA = /* groq */ `"id": _id,`',
      "export const fragmentB: string = 'title,'",
      'const query = defineQuery(`*[_type == "artist"][0]{${fragmentA} ${fragmentB}}`)',
    ].join('\n')
    expect((await contents(source)).at(-1)).toEqual('*[_type == "artist"][0]{"id": _id, title,}')
  })

  it('resolves fragments that use other fragments, however deep', async () => {
    const source = [
      'const a = groq`name`',
      'const b = groq`author->{${a}}`',
      'const c = defineQuery(`book{${b}}`)',
    ].join('\n')
    expect((await contents(source)).at(-1)).toEqual('book{author->{name}}')
  })

  it('resolves concatenation and wrapping', async () => {
    const source = [
      "const a = 'title,'",
      'const b = (a + " slug," + `${a}`) as const',
      'const c = defineQuery("*{" + b + "}" satisfies string)',
    ].join('\n')
    expect((await contents(source)).at(-1)).toEqual('*{title, slug,title,}')
  })

  it('resolves named, aliased, default and re-exported imports', async () => {
    const files = {
      '/app/src/fragments.ts': [
        'export const named = groq`named`',
        'const local = groq`local`',
        'export {local as aliased}',
        'export default groq`byDefault`',
        "export {far as reexported} from './far'",
        "export * from './all'",
      ].join('\n'),
      '/app/src/far.ts': 'export const far = "far"',
      '/app/src/all.ts': 'export const everything = "all"',
    }
    const source = [
      "import byDefault, {named, aliased as renamed, reexported, everything} from './fragments'",
      'defineQuery(`${byDefault},${named},${renamed},${reexported},${everything}`)',
    ].join('\n')
    expect(await contents(source, files)).toEqual(['byDefault,named,local,far,all'])
  })

  it('resolves imports through folders, index files and .js specifiers', async () => {
    const files = {
      '/app/src/lib/index.ts': 'export const fromIndex = "index"',
      '/app/src/other.tsx': 'export const other = "other"',
    }
    const source = [
      "import {fromIndex} from './lib'",
      "import {other} from './other.js'",
      'groq`${fromIndex} ${other}`',
    ].join('\n')
    expect(await contents(source, files)).toEqual(['index other'])
  })

  it('resolves tsconfig paths and baseUrl', async () => {
    const files = {
      '/app/tsconfig.json':
        '{\n // comment\n "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["src/*"],},},\n}',
      '/app/src/queries/fragments.ts': 'export const frag = "frag"',
      '/app/src/shared.ts': 'export const shared = "shared"',
    }
    const source = [
      "import {frag} from '@/queries/fragments'",
      "import {shared} from 'src/shared'",
      'groq`${frag} ${shared}`',
    ].join('\n')
    expect(await contents(source, files)).toEqual(['frag shared'])
  })

  it('inlines .groq files', async () => {
    const files = { '/app/src/image.groq': '"image": image' }
    const source = "import image from './image.groq'\ngroq`{${image}}`"
    expect(await contents(source, files)).toEqual(['{"image": image}'])
  })

  it('leaves what it cannot resolve as written', async () => {
    const files = { '/app/src/dynamic.ts': 'export const dynamic = build()' }
    const source = [
      "import {dynamic} from './dynamic'",
      "import {missing} from './missing'",
      "import {pkg} from 'some-package'",
      'groq`${dynamic} ${missing} ${pkg} ${fn(1)} ${obj.prop} ${undeclared}`',
    ].join('\n')
    expect(await contents(source, files)).toEqual([
      '${dynamic} ${missing} ${pkg} ${fn(1)} ${obj.prop} ${undeclared}',
    ])
  })

  it('does not follow a fragment that is not a plain string', async () => {
    const source = [
      'const a = cond ? groq`x` : groq`y`',
      'const b = groq`x`.trim()',
      'groq`${a} ${b}`',
    ].join('\n')
    expect((await contents(source)).at(-1)).toEqual('${a} ${b}')
  })

  it('survives fragments that refer to each other', async () => {
    const files = {
      '/app/src/a.ts': "import {b} from './b'\nexport const a = groq`a${b}`",
      '/app/src/b.ts': "import {a} from './a'\nexport const b = groq`b${a}`",
      '/app/src/star.ts': "export * from './star'",
    }
    const source = "import {a} from './a'\nimport {nothing} from './star'\ngroq`${a} ${nothing}`"
    expect(await contents(source, files)).toEqual(['ab${a} ${nothing}'])
  })

  it('only sees top-level declarations and ignores code in comments and strings', async () => {
    const source = [
      'function f() { const inner = groq`inner` }',
      '// const commented = groq`commented`',
      'const text = "groq`not a query`"',
      'groq`${inner} ${commented}`',
    ].join('\n')
    expect(await contents(source)).toEqual(['inner', '${inner} ${commented}'])
  })

  it('finds queries after regular expressions and nested templates', async () => {
    const source = [
      'const re = /`[/]`/g',
      'const half = a / b / c',
      'const nested = `x ${`y ${1}`}`',
      'groq`last`',
    ].join('\n')
    expect(await contents(source)).toEqual(['last'])
  })

  it('does not throw on unfinished code', async () => {
    expect(await contents('const a = groq`one`\nconst q = groq`*[_type == ${a')).toEqual([
      'one',
      '*[_type == one',
    ])
    expect(await contents('defineQuery(')).toEqual([])
  })

  it('ignores groq that is not the tag and defineQuery that is not a call', async () => {
    const source =
      "import {defineQuery} from 'groq'\nobj.groq`a`\nobj.defineQuery('b')\nconst groq = 1"
    expect(await contents(source)).toEqual([])
  })
})

describe('fragments from the example in sanity-io/vscode-sanity#32', () => {
  const fragmentFile = 'export const author = defineQuery(`{\n  name,\n}`);\n'
  const query = [
    'const query = defineQuery(`',
    '  *[_type == "article"]{',
    '    "title": coalesce(select($lang == "es" => title.es, title.en), ""),',
    '    author->${author},',
    '  }`);',
  ].join('\n')
  const resolved = [
    '\n  *[_type == "article"]{',
    '    "title": coalesce(select($lang == "es" => title.es, title.en), ""),',
    '    author->{\n  name,\n},',
    '  }',
  ].join('\n')

  it('inlines a fragment declared in the same file', async () => {
    expect((await contents(`${fragmentFile}\n${query}`)).at(-1)).toEqual(resolved)
  })

  it('inlines a fragment imported from another file', async () => {
    const source = `import {author} from './fragments'\n${query}`
    expect(await contents(source, { '/app/src/fragments.ts': fragmentFile })).toEqual([resolved])
  })
})

describe('packages', () => {
  it('follows workspace packages through node_modules, from their source', async () => {
    const files = {
      '/app/node_modules/@repo/queries/package.json': JSON.stringify({
        name: '@repo/queries',
        exports: {
          '.': { types: './dist/index.d.ts', source: './src/index.ts', import: './dist/index.js' },
          './fragments/*': { source: './src/fragments/*.ts' },
        },
      }),
      '/repo/queries/src/index.ts': 'export const fromIndex = groq`index`',
      '/repo/queries/src/fragments/image.ts': 'export const image = groq`image`',
      '/app/node_modules/plain/package.json': JSON.stringify({ main: './lib/main.js' }),
      '/app/node_modules/plain/lib/main.js': 'var plain = "plain";\nexport { plain };',
    }
    const host: FragmentHost = {
      readFile: async (file) => new Map(Object.entries(files)).get(file),
      realpath: async (file) =>
        file === '/app/node_modules/@repo/queries' ? '/repo/queries' : file,
    }
    const source = [
      "import {fromIndex} from '@repo/queries'",
      "import {image} from '@repo/queries/fragments/image'",
      "import {plain} from 'plain'",
      'groq`${fromIndex} ${image} ${plain}`',
    ].join('\n')
    const [query] = await resolveEmbeddedQueries(source, '/app/src/deep/query.ts', host)
    expect(query?.content).toEqual('index image plain')
  })

  it('prefers tsconfig paths over node_modules', async () => {
    const files = {
      '/app/tsconfig.json': '{"compilerOptions": {"paths": {"shared": ["./src/shared.ts"]}}}',
      '/app/src/shared.ts': 'export const value = "mapped"',
      '/app/node_modules/shared/package.json': '{"main": "index.js"}',
      '/app/node_modules/shared/index.js': 'export const value = "package"',
    }
    const source = "import {value} from 'shared'\ngroq`${value}`"
    expect(await contents(source, files)).toEqual(['mapped'])
  })
})
