import { describe, expect, it } from 'vitest'
import {
  getFunctionDefinition,
  getFunctionReferences,
  type FileSpan,
  type FunctionNavigationContext,
} from '../capabilities/function-navigation.js'
import type { GroqFunction } from '../content-mapper/functions.js'
import { findFunctionCalls, parseDefinitions } from '../content-mapper/groq-scanner.js'
import { isDefinitionsOnly } from '../functions.js'

const IMAGE = `// Shared image functions.
fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
fn image::richText($blocks) = $blocks[]{
  ...,
  _type == "image" => {_key, _type, alt, caption, crop, hotspot, "asset": image::asset(asset)},
  _type == "timeline" => {
    ...,
    items[]{..., milestones[]{..., "image": image::field(image)}}
  }
};
`

const SLUG_PAGE = `*[_type == "page" && slug.current == $slug][0] {
  _id,
  "body": image::richText(body),
  title
}
`

const HERO = `*[_type == "hero"][0]{"image": image::field(image), "more": image::richText(more)}
`

const SHADOWING = `fn image::richText($blocks) = $blocks[]{_key};
*[_type == "post"]{"body": image::richText(body)}
`

const files = new Map([
  ['/p/groq/image.groq', IMAGE],
  ['/p/queries/slugPage.groq', SLUG_PAGE],
  ['/p/queries/hero.groq', HERO],
  ['/p/queries/shadowing.groq', SHADOWING],
])

function sharedFunctions(): Map<string, GroqFunction> {
  const file = '/p/groq/image.groq'
  return new Map(
    parseDefinitions(IMAGE).definitions.map(
      ({ name, calls, start, end, nameStart, nameEnd }) =>
        [
          name,
          { name, calls, file, source: IMAGE.slice(start, end), start, nameStart, nameEnd },
        ] as const
    )
  )
}

function contextFor(file: string): FunctionNavigationContext {
  return {
    file,
    text: files.get(file)!,
    languageId: 'groq',
    functions: sharedFunctions(),
    read: (each) => files.get(each),
    groqFiles: () => [...files.keys()].sort(),
  }
}

const textOf = (span: FileSpan) => files.get(span.file)!.slice(span.start, span.end)

describe('custom function navigation', () => {
  it('goes from a call in a query to the definition in the functions file', () => {
    const offset = SLUG_PAGE.indexOf('richText')
    const found = getFunctionDefinition(contextFor('/p/queries/slugPage.groq'), offset)
    expect(found && textOf(found.origin)).toBe('image::richText')
    expect(found?.target.file).toBe('/p/groq/image.groq')
    expect(found && IMAGE.slice(found.target.nameStart, found.target.nameEnd)).toBe(
      'image::richText'
    )
    expect(found && textOf(found.target)).toMatch(/^fn image::richText\(\$blocks\)[\s\S]*\};$/)
  })

  it('goes from a call inside a function body to the definition it calls', () => {
    const offset = IMAGE.indexOf('image::field(image)')
    const found = getFunctionDefinition(contextFor('/p/groq/image.groq'), offset)
    expect(found && IMAGE.slice(found.target.nameStart, found.target.nameEnd)).toBe('image::field')
    expect(found && IMAGE.slice(found.target.start, found.target.start + 18)).toBe(
      'fn image::field($i'
    )
  })

  it('goes to the definition a query starts with when it shadows a shared one', () => {
    const offset = SHADOWING.lastIndexOf('richText')
    const found = getFunctionDefinition(contextFor('/p/queries/shadowing.groq'), offset)
    expect(found?.target.file).toBe('/p/queries/shadowing.groq')
    expect(found?.target.nameStart).toBe(3)
  })

  it('finds nothing outside a function name', () => {
    expect(getFunctionDefinition(contextFor('/p/queries/slugPage.groq'), 3)).toBeUndefined()
    expect(getFunctionReferences(contextFor('/p/queries/slugPage.groq'), 3, true)).toEqual([])
  })

  it('finds the calls of a shared function in function files and queries', () => {
    const offset = IMAGE.indexOf('fn image::field(') + 'fn image::'.length
    const references = getFunctionReferences(contextFor('/p/groq/image.groq'), offset, false)
    expect(references.map((span) => [span.file, textOf(span)])).toEqual([
      ['/p/groq/image.groq', 'image::field'],
      ['/p/queries/hero.groq', 'image::field'],
    ])
  })

  it('finds the calls from a call, leaving out files that define the function themselves', () => {
    const offset = SLUG_PAGE.indexOf('richText')
    const references = getFunctionReferences(contextFor('/p/queries/slugPage.groq'), offset, true)
    expect(references.map((span) => span.file)).toEqual([
      '/p/groq/image.groq',
      '/p/queries/hero.groq',
      '/p/queries/slugPage.groq',
    ])
    expect(textOf(references[0]!)).toBe('image::richText')
  })

  it('finds the calls of a function a query defines in that query only', () => {
    const references = getFunctionReferences(contextFor('/p/queries/shadowing.groq'), 5, true)
    expect(references.map((span) => [span.file, span.start])).toEqual([
      ['/p/queries/shadowing.groq', 3],
      ['/p/queries/shadowing.groq', SHADOWING.lastIndexOf('image::richText')],
    ])
  })

  it('reads the positions of definitions and calls', () => {
    const [asset] = parseDefinitions(IMAGE).definitions
    expect(asset && IMAGE.slice(asset.nameStart, asset.nameEnd)).toBe('image::asset')
    expect(findFunctionCalls('"image::x(" + image :: y(a) // image::z(b)')).toEqual([
      { name: 'image::y', start: 14, end: 24 },
    ])
  })

  it('tells a file of only definitions from a query', () => {
    expect(isDefinitionsOnly(IMAGE)).toBe(true)
    expect(isDefinitionsOnly(SLUG_PAGE)).toBe(false)
    expect(isDefinitionsOnly(SHADOWING)).toBe(false)
  })
})
