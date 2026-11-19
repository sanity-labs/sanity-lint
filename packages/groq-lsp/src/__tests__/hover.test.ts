import { describe, expect, it } from 'vitest'
import type { ObjectAttribute, SchemaType, TypeNode } from 'groq-js'
import { getHoverInfo } from '../capabilities/hover.js'
import type { GroqFunction } from '../content-mapper/functions.js'
import type { GroqQuery } from '../types.js'

const string: TypeNode = { type: 'string' }
const number: TypeNode = { type: 'number' }

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
    slug: attribute(
      {
        type: 'object',
        attributes: {
          _type: attribute({ type: 'string', value: 'slug' }),
          current: attribute(string, true),
        },
      },
      true
    ),
    body: attribute({ type: 'array', of: { type: 'object', attributes: {} } }),
    author: attribute({
      type: 'object',
      attributes: {
        _ref: attribute(string),
        _type: attribute({ type: 'string', value: 'reference' }),
      },
      dereferencesTo: 'author',
    }),
    tags: attribute({ type: 'array', of: string }, true),
    seo: attribute({ type: 'inline', name: 'seo' }),
    coverImage: attribute({
      type: 'object',
      attributes: {
        crop: attribute({
          type: 'object',
          attributes: {
            _type: attribute({ type: 'string', value: 'sanity.imageCrop' }),
            top: attribute(number, true),
            bottom: attribute(number, true),
            left: attribute(number, true),
            right: attribute(number, true),
          },
        }),
        hotspot: attribute({
          type: 'object',
          attributes: {
            _type: attribute({ type: 'string', value: 'sanity.imageHotspot' }),
            x: attribute(number, true),
            y: attribute(number, true),
            height: attribute(number, true),
            width: attribute(number, true),
          },
        }),
        asset: attribute(
          {
            type: 'object',
            attributes: {
              _ref: attribute(string),
              _type: attribute({ type: 'string', value: 'reference' }),
            },
            dereferencesTo: 'sanity.imageAsset',
          },
          true
        ),
      },
    }),
  }),
  documentType('sanity.imageAsset', {
    url: attribute(string, true),
    metadata: attribute(
      {
        type: 'object',
        attributes: {
          lqip: attribute(string, true),
          dimensions: attribute(
            {
              type: 'object',
              attributes: {
                _type: attribute({ type: 'string', value: 'sanity.imageDimensions' }),
                height: attribute(number, true),
                width: attribute(number, true),
                aspectRatio: attribute(number, true),
              },
            },
            true
          ),
        },
      },
      true
    ),
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
  // `sanity schema extract` writes an array of references as `{ _key }` items whose `rest` is a
  // named reference type, which carries `dereferencesTo`.
  documentType('home', {
    title: attribute(string, true),
    showcaseProjects: attribute(
      {
        type: 'array',
        of: {
          type: 'object',
          attributes: { _key: attribute(string) },
          rest: { type: 'inline', name: 'project.reference' },
        },
      },
      true
    ),
  }),
  documentType('project', {
    title: attribute(string, true),
    slug: attribute({ type: 'object', attributes: { current: attribute(string, true) } }, true),
    tags: attribute({ type: 'array', of: string }, true),
  }),
  {
    type: 'type',
    name: 'project.reference',
    value: {
      type: 'object',
      attributes: {
        _ref: attribute(string),
        _type: attribute({ type: 'string', value: 'reference' }),
        _weak: attribute({ type: 'boolean' }, true),
      },
      dereferencesTo: 'project',
    },
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
  [
    'image::field',
    {
      name: 'image::field',
      calls: ['image::asset'],
      file: 'groq/image.groq',
      source: 'fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};',
    },
  ],
  [
    'image::pick',
    {
      name: 'image::pick',
      calls: [],
      file: 'groq/image.groq',
      source: 'fn image::pick($image) = $image{crop};',
    },
  ],
  [
    'image::asset',
    {
      name: 'image::asset',
      calls: [],
      file: 'groq/image.groq',
      source: 'fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};',
    },
  ],
])

function queryOf(text: string): GroqQuery {
  return { query: text, start: 0, end: text.length, line: 0, column: 0 }
}

function hoverTextAt(text: string, offset: number, withSchema = true): string | null {
  const hover = getHoverInfo(
    queryOf(text),
    offset,
    withSchema ? { schema, functions } : { functions }
  )
  const contents = hover?.contents
  return contents && typeof contents === 'object' && 'value' in contents ? contents.value : null
}

function fenced(text: string): string {
  return `\`\`\`groq\n${text}\n\`\`\``
}

function hoverText(text: string, marker: string, occurrence = 0, withSchema = true): string | null {
  let offset = -1
  for (let seen = 0; seen <= occurrence; seen++) {
    offset = text.indexOf(marker, offset + 1)
  }
  expect(offset).toBeGreaterThanOrEqual(0)
  return hoverTextAt(text, offset + 1, withSchema)
}

const ALL_TYPES = '"author" | "home" | "page" | "post" | "project" | "sanity.imageAsset"'

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
    expect(hoverText('*[_type == "page"]{subtitle}', 'subtitle')).toBe(
      fenced('subtitle: string | null')
    )
  })

  it('hovers _type in a projection as the type the query filters to', () => {
    const hover = hoverText(PAGE_QUERY, '_type', 1)
    expect(hover).toContain('_type: "page"\n')
    expect(hover).toContain('Document type name')
  })

  it('hovers _type in a filter as every document type, not the one it is compared to', () => {
    for (const query of [PAGE_QUERY, '*[_type == "page"][0]', '*[_type == "page"]']) {
      expect(hoverText(query, '_type')).toContain(ALL_TYPES)
    }
    expect(hoverText('*[slug.current == $slug && _type == "page"][0]', '_type')).toContain(
      ALL_TYPES
    )
    expect(hoverText('*[_type == "page" || _type == "post"]', '_type')).toContain(ALL_TYPES)
  })

  it('narrows _type in the projection of a == filter and widens it in the filter', () => {
    const query = '*[_type == "post"]{_type}'
    expect(hoverText(query, '_type', 0)).toBe(
      `${fenced(`_type: ${ALL_TYPES}`)}\n\nFilters documents by their type`
    )
    expect(hoverText(query, '_type', 1)).toBe(`${fenced('_type: "post"')}\n\nDocument type name`)
  })

  it('narrows _type in the projection of an in filter to the listed types', () => {
    const query = '*[_type in ["post","author"]]{_type}'
    expect(hoverText(query, '_type', 0)).toContain(`_type: ${ALL_TYPES}\n`)
    expect(hoverText(query, '_type', 1)).toContain('_type: "author" | "post"\n')
  })

  it('narrows _type in the projection of OR-ed and AND-ed filters', () => {
    const either = '*[_type == "page" || _type == "post"]{_type}'
    expect(hoverText(either, '_type', 2)).toContain('_type: "page" | "post"\n')
    expect(hoverText('*[_type == "post" && views > 3]{_type}', '_type', 1)).toContain(
      '_type: "post"\n'
    )
  })

  it('widens _type in a nested filter and keeps the parent narrowed', () => {
    const query = '*[_type == "post"]{"x": *[_type == "author" && ^._type == "post"]{_type}}'
    expect(hoverText(query, '_type', 1)).toContain(`_type: ${ALL_TYPES}\n`)
    expect(hoverText(query, '_type', 2)).toContain('_type: "post"\n')
    expect(hoverText(query, '_type', 3)).toContain('_type: "author"\n')
  })

  it('widens other fields in a filter to every type they may have there', () => {
    expect(hoverText('*[_type == "post" && title == "x"]', 'title')).toContain(
      'title: string | number'
    )
    expect(hoverText('*[_type == "post"]{title}', 'title')).toContain('title: number')
  })

  it('hovers the segments of a path through the schema', () => {
    expect(hoverText(PAGE_QUERY, 'current')).toBe(fenced('current: string | null'))
    expect(hoverText(PAGE_QUERY, 'slug', 3)).toBe(
      fenced('slug: {\n  _type: "slug";\n  current?: string;\n} | null')
    )
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
    expect(hoverText(PAGE_QUERY, 'body', 1)).toBe(fenced('body: Array<{}>'))
  })

  it('hovers a field in a filter against the document types in scope', () => {
    expect(hoverText('*[_type == "post" && views > 3]', 'views')).toContain('views: number')
  })

  it('keeps the old hover for a field the schema does not have', () => {
    const hover = hoverText(PAGE_QUERY, 'overview')
    expect(hover).toContain('overview: {\n  _id: string;')
    expect(hover).toContain('} | null')
  })

  it('keeps the old hover without a schema', () => {
    expect(hoverText(PAGE_QUERY, 'title', 0, false)).toBe('**title** (field)')
    expect(hoverText(PAGE_QUERY, '_type', 1, false)).toBe(
      '**_type** (system-field)\n\nDocument type name'
    )
  })

  it('does not take a type name from a type the schema does not define', () => {
    expect(hoverText('*[_type == "missing"]', '_type')).not.toContain('missing')
  })

  it('ignores brackets inside strings', () => {
    expect(hoverText('*[_type == "page" && subtitle == "{["]{title}', 'title', 1)).toContain(
      'title: string'
    )
  })
})

const COVER_QUERY = `*[_type == "page"][0]{
  "coverImage": image::field(coverImage),
  "plain": image::richText(body),
}`

const COVER_IMAGE_SHAPE = `{
  crop: {
    _type: "sanity.imageCrop";
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  hotspot: {
    _type: "sanity.imageHotspot";
    x?: number;
    y?: number;
    height?: number;
    width?: number;
  };
  asset: {
    url: string | null;
    metadata: {
      lqip: string | null;
      dimensions: {
        _type: "sanity.imageDimensions";
        height?: number;
        width?: number;
        aspectRatio?: number;
      } | null;
    } | null;
  } | null;
}`

describe('hover expands object types', () => {
  it('hovers a projection field with the full shape of its object type', () => {
    expect(hoverText('*[_type == "page"][0]{coverImage}', 'coverImage')).toBe(
      fenced(`coverImage: {
  crop: {
    _type: "sanity.imageCrop";
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  hotspot: {
    _type: "sanity.imageHotspot";
    x?: number;
    y?: number;
    height?: number;
    width?: number;
  };
  asset?: {
    _ref: string;
    _type: "reference";
  };
}`)
    )
  })

  it('hovers a named type as its shape', () => {
    expect(hoverText('*[_type == "page"]{seo}', 'seo')).toBe(
      fenced('seo: {\n  description: string;\n}')
    )
  })
})

const CODY_QUERY = `{
  "settings": *[_type == "page"][0] { "ogImage": image::field(coverImage) },
  "home": *[_type == "page"][0] { title, "overview": pt::text(body) }
}`

describe('hover string literals', () => {
  it('hovers a string in a filter as the literal, not a looked-up type', () => {
    expect(hoverText(CODY_QUERY, '"page"')).toBe(fenced('"page"'))
    expect(hoverText(CODY_QUERY, 'page', 0)).toBe(fenced('"page"'))
    expect(hoverText('*[_type in ["page", "post"]]', '"post"')).toBe(fenced('"post"'))
  })

  it('hovers a string that matches a field or key name as the literal', () => {
    expect(hoverText('*[_type == "page" && title == "title"]', '"title"')).toBe(fenced('"title"'))
    expect(hoverText('*[_type == "page"]{"x": "overview"}', '"overview"')).toBe(
      fenced('"overview"')
    )
  })

  it('hovers a string with spaces, in a filter and as a key', () => {
    expect(hoverText('*[_type == "page" && title == "hello big world"]', 'big')).toBe(
      fenced('"hello big world"')
    )
    expect(hoverText('*[_type == "page"]{"my title": title}', 'title', 0)).toBe(
      fenced('my title: string')
    )
    expect(hoverText('*[_type == "page"]{"my title": title}', ' title"')).toBe(
      fenced('my title: string')
    )
  })

  it('hovers a key whose value is a function the query defines', () => {
    const query =
      'fn local::title($page) = $page{title};\n*[_type == "page"][0]{"t": local::title(@)}'
    expect(hoverText(query, '"t"')).toBe(fenced('t: {\n  title: string;\n}'))
  })

  it('hovers a string without a schema as the literal', () => {
    expect(hoverText('*[_type == "page"]', '"page"', 0, false)).toBe(fenced('"page"'))
  })

  it('does not treat the brackets or escapes of a string as code', () => {
    const literal = String.raw`"a\"b{["`
    expect(hoverText(`*[_type == "page" && title == ${literal}]`, 'b{')).toBe(fenced(literal))
  })

  it('hovers a projection key as the type of its value', () => {
    expect(hoverText(CODY_QUERY, '"overview"')).toBe(fenced('overview: string'))
    expect(hoverText(CODY_QUERY, 'overview', 0)).toBe(fenced('overview: string'))
  })

  it('hovers a projection key whose value is a function call as the shape it returns', () => {
    expect(hoverText(CODY_QUERY, '"ogImage"')).toContain('ogImage: {\n  crop: {')
  })

  it('hovers a key of an object literal as the type of its value', () => {
    expect(hoverText(CODY_QUERY, '"settings"')).toContain('settings: {\n  ogImage: {')
    expect(hoverText('{"n": count(*[_type == "page"])}', '"n"')).toBe(fenced('n: number'))
  })

  it('hovers a key in a projection nested in a filter or another projection', () => {
    expect(hoverText('*[_type == "page"][0]{seo{"d": description}}', '"d"')).toBe(
      fenced('d: string')
    )
    expect(hoverText('*[_type == "post"]{"x": *[_type == "page"]{"t": title}}', '"t"')).toBe(
      fenced('t: string')
    )
  })

  it('hovers a key as unknown when its value is, and as its name without a schema', () => {
    expect(hoverText('*[_type == "page"]{"x": $param}', '"x"')).toBe(fenced('x: unknown'))
    expect(hoverText(CODY_QUERY, '"overview"', 0, false)).toBe('**overview** (field)')
  })
})

describe('hover parameters', () => {
  const PROJECT_QUERY = '*[_type == "page" && slug.current == $slug][0] { title }'

  it('hovers a parameter compared to a field as the type of the field, without null', () => {
    expect(hoverText(PROJECT_QUERY, '$slug')).toBe(fenced('$slug: string'))
    expect(hoverText(PROJECT_QUERY, 'slug', 1)).toBe(fenced('$slug: string'))
    expect(hoverText(PROJECT_QUERY, '$slug')).not.toContain('_id')
  })

  it('hovers the parameter from the $ and from the last letter', () => {
    const query = PROJECT_QUERY
    const dollar = query.indexOf('$slug')
    expect(hoverTextAt(query, dollar)).toBe(fenced('$slug: string'))
    expect(hoverTextAt(query, dollar + '$slug'.length)).toBe(fenced('$slug: string'))
  })

  it('infers the type from the document types the filter keeps', () => {
    expect(hoverText('*[_type == "post" && title == $t]', '$t')).toBe(fenced('$t: number'))
    expect(hoverText('*[_type == "page" && title == $t]', '$t')).toBe(fenced('$t: string'))
    expect(hoverText('*[_type == "page" && $t == title]', '$t')).toBe(fenced('$t: string'))
    expect(hoverText('*[_type == "page" && title != $t]', '$t')).toBe(fenced('$t: string'))
    expect(hoverText('*[_type == "post" && views > $min]', '$min')).toBe(fenced('$min: number'))
  })

  it('infers an array for a parameter a value is tested against with in', () => {
    expect(hoverText('*[_type == "page" && title in $titles]', '$titles')).toBe(
      fenced('$titles: Array<string>')
    )
    expect(hoverText('*[_type == "page" && $tag in tags]', '$tag')).toBe(fenced('$tag: string'))
  })

  it('makes a match operand a string and a slice bound a number', () => {
    expect(hoverText('*[title match $q]', '$q')).toBe(fenced('$q: string'))
    expect(hoverText('*[_type == "page"][0...$n]', '$n')).toBe(fenced('$n: number'))
    expect(hoverText('*[_type == "page"][$from..$to]', '$to')).toBe(fenced('$to: number'))
  })

  it('leaves a subscript parameter unknown, as it may be an index, a key or a filter', () => {
    expect(hoverText('*[_type == "page"][$i]', '$i')).toBe(fenced('$i: unknown'))
  })

  it('reads a filter in a query whose root is an object it projects again', () => {
    const query = `// A type with no documents (https://example.com) gets a placeholder.
{
  "slugs": *[_type == $type && defined(slug.current)] {"slug": slug.current}
} {
  "slugs": select(count(slugs) > 0 => slugs, [{"slug": "__placeholder__"}])
}.slugs`
    expect(hoverText(query, '$type')).toBe(fenced('$type: "page" | "project"'))
  })

  it('types the bounds of a range, an arithmetic operand and a compared literal', () => {
    const range = '*[_type == "post" && views in $min..$max]'
    expect(hoverText(range, '$min')).toBe(fenced('$min: number'))
    expect(hoverText(range, '$max')).toBe(fenced('$max: number'))
    expect(hoverText('*[_type == "post" && views + $bump > 10]', '$bump')).toBe(
      fenced('$bump: number')
    )
    expect(hoverText('*[_type == "page" && $flag == true]', '$flag')).toBe(fenced('$flag: boolean'))
    expect(hoverText('*[_type == "page" && "a" == $mode]', '$mode')).toBe(fenced('$mode: string'))
  })

  it('reads an operand in a projection of a dereference', () => {
    const query = '*[_type == "page"]{"same": author->{"is": name == $name}}'
    expect(hoverText(query, '$name')).toBe(fenced('$name: string'))
  })

  it('joins a slice bound with what a comparison says', () => {
    const query = '*[_type == "post" && views > $n][0...$n]'
    expect(hoverText(query, '$n')).toBe(fenced('$n: number'))
  })

  it('reads an operand in a filter inside a function argument', () => {
    const query = '*[_type == "page" && count(tags[@ == $tag]) > 0]'
    expect(hoverText(query, '$tag')).toBe(fenced('$tag: string'))
  })

  it('joins what every use of the parameter says', () => {
    const query = '*[_type == "page" && title == $x || _type == "post" && views == $x]'
    expect(hoverText(query, '$x', 1)).toBe(fenced('$x: number | string'))
    expect(hoverText(query, '$x', 0)).toBe(fenced('$x: number | string'))
  })

  it('reads the operand in the scope it is written in', () => {
    const query =
      '*[_type == "post"]{"p": *[_type == "page" && _id == ^._id && slug.current == $s]}'
    expect(hoverText(query, '$s')).toBe(fenced('$s: string'))
    expect(hoverText('*[_type == "page"]{"p": coalesce(title, "") == $c}', '$c')).toBe(
      fenced('$c: string')
    )
  })

  it('hovers a parameter the query does not type as unknown', () => {
    expect(hoverText('*[_type == "page"]{"a": $x}', '$x')).toBe(fenced('$x: unknown'))
    expect(hoverText('*[_type == "page"]{"a": count($x)}', '$x')).toBe(fenced('$x: unknown'))
    expect(hoverText('*[_type == "page" && nope == $x]', '$x')).toBe(fenced('$x: unknown'))
    expect(hoverText('*[_type == "page" && $a == $b]', '$b')).toBe(fenced('$b: unknown'))
  })

  it('hovers a parameter without a schema as its name', () => {
    expect(hoverText(PROJECT_QUERY, '$slug', 0, false)).toBe('**$slug** (parameter)')
  })

  it('still hovers the field next to a parameter as the field', () => {
    expect(hoverText(PROJECT_QUERY, 'current')).toBe(fenced('current: string | null'))
  })
})

describe('hover custom function calls', () => {
  const call = 'image::field(coverImage)'
  const callStart = COVER_QUERY.indexOf(call)
  const expected = fenced(`image::field: ${COVER_IMAGE_SHAPE}`)

  it('hovers the name of a call as the full shape the function returns', () => {
    expect(hoverTextAt(COVER_QUERY, callStart)).toBe(expected)
    expect(hoverTextAt(COVER_QUERY, callStart + 2)).toBe(expected)
    expect(hoverTextAt(COVER_QUERY, callStart + 'image::'.length + 2)).toBe(expected)
  })

  it('hovers the separator and the parentheses of a call', () => {
    expect(hoverTextAt(COVER_QUERY, callStart + 'image'.length)).toBe(expected)
    expect(hoverTextAt(COVER_QUERY, callStart + 'image::field'.length)).toBe(expected)
    expect(hoverTextAt(COVER_QUERY, callStart + call.length - 1)).toBe(expected)
  })

  it('keeps the argument hovering as the field it names, with its full shape', () => {
    const argument = hoverTextAt(COVER_QUERY, callStart + 'image::field('.length + 2)
    expect(argument).toContain('coverImage: {\n  crop: {\n    _type: "sanity.imageCrop";')
    expect(argument).not.toContain('image::field')
    expect(hoverTextAt(COVER_QUERY, callStart + call.length) ?? '').not.toContain('image::field')
  })

  it('resolves a function whose body does not project, from the argument type', () => {
    expect(hoverText(COVER_QUERY, 'image::richText', 0)).toBe(fenced('image::richText: Array<{}>'))
    expect(
      hoverText('*[_type == "page"][0]{"a": image::asset(coverImage.asset)}', 'asset')
    ).toContain('image::asset: {\n  url: string | null;\n  metadata: {')
  })

  it('resolves nested calls, the inner and the outer', () => {
    const query = '*[_type == "page"][0]{"x": image::pick(image::field(coverImage))}'
    expect(hoverText(query, 'field', 0)).toBe(expected)
    const outer = hoverText(query, 'pick', 0)
    expect(outer).toContain('image::pick: {\n  crop: {\n    _type: "sanity.imageCrop";')
    expect(outer).not.toContain('hotspot')
  })

  it('resolves a call outside any projection', () => {
    const query = '*[_type == "page"][0].coverImage'
    expect(hoverText(`image::field(${query})`, 'image::field')).toBe(
      expected.replace(/\n```$/, ' | null\n```')
    )
  })

  it('resolves a function defined in the query itself', () => {
    const query =
      'fn local::title($page) = $page{title};\n*[_type == "page"][0]{"t": local::title(@)}'
    expect(hoverText(query, 'local::title', 1)).toBe(fenced('local::title: {\n  title: string;\n}'))
  })

  it('does not hover the definition of a function as a call', () => {
    const query =
      'fn local::title($page) = $page{title};\n*[_type == "page"][0]{"t": local::title(@)}'
    expect(hoverText(query, 'local::title', 0)).not.toContain('local::title: ')
  })

  it('keeps the existing hover for built-in functions', () => {
    expect(hoverText('*[_type == "page"]{"n": count(body)}', 'count')).toContain('count(array)')
    expect(hoverText('*[_type == "page"]{"t": pt::text(body)}', 'text')).not.toContain('pt::text:')
  })

  it('ignores calls in strings and calls the functions do not define', () => {
    expect(hoverText('*[title == "image::field(x)"]', 'image::field') ?? '').not.toContain(
      'image::field:'
    )
    expect(hoverText('*[_type == "page"]{"a": other::fn(title)}', 'other') ?? '').not.toContain(
      'other::fn:'
    )
  })

  it('keeps the fallback hover without a schema', () => {
    expect(hoverText(COVER_QUERY, 'image::field', 0, false)).toBe('**image** (field)')
  })
})

const HOME_QUERY = `*[_type == "home"][0] {
  showcaseProjects[] {
    _key,
    ...@-> {
      _id,
      _type,
      "slug": slug.current,
      tags,
      title
    }
  },
  title
}`

const SHOWCASE_SHAPE = `Array<{
  _key: string;
  _id: string;
  _type: "project";
  slug: string | null;
  tags: Array<string> | null;
  title: string | null;
}> | null`

describe('hover references and dereference spreads', () => {
  it('hovers a field with a projection as what the projection makes of it', () => {
    expect(hoverText(HOME_QUERY, 'showcaseProjects')).toBe(
      fenced(`showcaseProjects: ${SHOWCASE_SHAPE}`)
    )
    expect(hoverText('*[_type == "page"][0]{author->{name}}', 'author')).toBe(
      fenced('author: {\n  name: string;\n}')
    )
    expect(hoverText('*[_type == "page"][0]{slug{current}}', 'slug')).toBe(
      fenced('slug: {\n  current: string | null;\n} | null')
    )
  })

  it('hovers fields inside a ...@-> spread against the dereferenced document', () => {
    expect(hoverText(HOME_QUERY, '_id')).toBe(
      fenced('_id: string') + '\n\nUnique document identifier'
    )
    expect(hoverText(HOME_QUERY, '_type', 1)).toContain('_type: "project"\n')
    expect(hoverText(HOME_QUERY, 'current')).toBe(fenced('current: string | null'))
    expect(hoverText(HOME_QUERY, 'slug', 1)).toBe(fenced('slug: {\n  current?: string;\n} | null'))
    expect(hoverText(HOME_QUERY, 'tags')).toBe(fenced('tags: Array<string> | null'))
    expect(hoverText(HOME_QUERY, 'title')).toBe(fenced('title: string | null'))
    expect(hoverText(HOME_QUERY, '_key')).toContain('_key: string\n')
  })

  it('hovers fields inside a ...@-> spread without a trailing projection elsewhere', () => {
    const query = '*[_type == "home"][0]{showcaseProjects[]{...@->{title}}}'
    expect(hoverText(query, 'title')).toBe(fenced('title: string | null'))
    expect(hoverText(query, 'showcaseProjects')).toBe(
      fenced('showcaseProjects: Array<{\n  title: string | null;\n}> | null')
    )
  })

  it('hovers the parent document field next to the spread', () => {
    expect(hoverText(HOME_QUERY, 'title', 1)).toBe(fenced('title: string | null'))
  })

  it('folds the rest of an object into its shape and its attributes', () => {
    expect(hoverText('*[_type == "home"]{showcaseProjects}', 'showcaseProjects')).toBe(
      fenced(`showcaseProjects: Array<{
  _key: string;
  _ref: string;
  _type: "reference";
  _weak?: boolean;
}> | null`)
    )
    expect(hoverText('*[_type == "home"]{showcaseProjects[]{_ref, _weak}}', '_ref')).toContain(
      '_ref: string\n'
    )
    expect(hoverText('*[_type == "home"]{showcaseProjects[]{_ref, _weak}}', '_weak')).toContain(
      '_weak: boolean | null\n'
    )
  })

  it('hovers fields through an array of references dereferenced as a whole', () => {
    const query = '*[_type == "home"][0]{showcaseProjects[]->{title, "s": slug.current}}'
    expect(hoverText(query, 'title')).toBe(fenced('title: string | null'))
    expect(hoverText(query, 'current')).toBe(fenced('current: string | null'))
    expect(hoverText(query, 'showcaseProjects')).toBe(
      fenced('showcaseProjects: Array<{\n  title: string | null;\n  s: string | null;\n}> | null')
    )
  })

  it('keeps plain and object spreads working', () => {
    expect(hoverText('*[_type == "page"]{..., "t": title}', 'title')).toContain('title: string')
    expect(hoverText('*[_type == "page"]{...seo, title}', 'title')).toContain('title: string')
    expect(hoverText('*[_type == "page"]{...seo, title}', 'seo')).toBe(
      fenced('seo: {\n  description: string;\n}')
    )
    expect(hoverText('*[_type == "page"]{...seo{description}}', 'description')).toContain(
      'description: string'
    )
    expect(hoverText('*[_type == "page"]{...author->{name}}', 'name')).toContain('name: string')
    expect(hoverText('*[_type == "page"]{...@{title}}', 'title')).toContain('title: string')
  })
})

describe('hover optional and nullable paths', () => {
  const current = fenced('current: string | null')

  it('hovers slug.current as string | null wherever it is written', () => {
    for (const query of [
      '*[_type == "page"]{"x": slug.current}',
      '*[_type == "page"][0]{"x": coalesce(slug.current, "")}',
      '*[_type == "page" && slug.current == $slug]',
      '*[defined(slug.current)]',
      '*[_type == "page"]{slug{current}}',
      '*[_type == "page"]{"x": @.slug.current}',
      '*[_type == "page"] | order(slug.current asc)',
      '*[_type == "page"] | order(_createdAt desc)[0]{"x": slug.current}',
      '*[_type == "page"]{"p": *[_type == "page" && slug.current == ^.slug.current]{"t": ^.slug.current}}',
    ]) {
      const offsets = [...query.matchAll(/current/g)].map((match) => match.index + 1)
      for (const offset of offsets) {
        expect(hoverTextAt(query, offset), `${query} @${offset}`).toBe(current)
      }
    }
  })

  it('hovers an attribute of a possibly missing element as nullable', () => {
    expect(hoverText('*[_type == "post"][0].title', 'title')).toBe(fenced('title: number | null'))
  })
})
