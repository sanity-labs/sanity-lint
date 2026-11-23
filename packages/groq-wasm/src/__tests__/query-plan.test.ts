import { describe, expect, it } from 'vitest'

import { lint } from '../index.js'

function rulesFor(query: string): Array<string> {
  return lint(query).map((finding) => finding.ruleId)
}

function spanText(query: string, ruleId: string): Array<string> {
  return lint(query)
    .filter((finding) => finding.ruleId === ruleId)
    .map((finding) => query.slice(finding.span?.start.offset, finding.span?.end.offset))
}

describe('findings match the query plan', () => {
  it.each([
    '*[_type == "author"][0...3]{ name, "books": count(*[_type == "book" && author._ref == ^._id]) }',
    '*[_type == "author"][0...3]{ "n": count(*[_type == "book" && references(^._id)]) }',
    '*[_type == "author"][0...3]{ "n": count(*[_id == ^._id]) }',
    '*[_type == "author" && count(*[_type == "book" && author._ref == ^._id]) > 2][0...3]',
  ])('does not report a batched correlated count: %s', (query) => {
    expect(rulesFor(query)).not.toContain('count-in-correlated-subquery')
  })

  it.each([
    '*[_type == "book"][0...3]{ "n": count(*[_type == "book" && _createdAt > ^._createdAt]) }',
    '*[_type == "author"][0...3]{ "n": count(*[_type == "book" && ^._id in reviews[]._ref]) }',
  ])('reports a correlated count that is filtered in memory: %s', (query) => {
    expect(rulesFor(query)).toContain('count-in-correlated-subquery')
  })

  it.each([
    '*[_type == "book"][0...3]{ "r": reviewsInline[1500..1600] }',
    '*[_type == "book"][0...3]{ "r": reviews[1500..1600]->title }',
    '*[_type == "book"][0...3]{ "r": reviewsInline[$start...$end] }',
    '*[_type == "book"][0...3]{ "r": reviewsInline[0..200] }',
  ])('does not report a slice of an attribute array as pagination: %s', (query) => {
    const rules = rulesFor(query)
    expect(rules).not.toContain('deep-pagination')
    expect(rules).not.toContain('deep-pagination-param')
    expect(rules).not.toContain('large-pages')
  })

  it('reports deep pagination at 1000 and for element access', () => {
    expect(spanText('*[_type == "book"][1000...1010]', 'deep-pagination')).toEqual([
      '[1000...1010]',
    ])
    expect(spanText('*[_type == "book"][5000]{ title }', 'deep-pagination')).toEqual(['[5000]'])
    expect(spanText('*[_type == "book"][$start]{ title }', 'deep-pagination-param')).toEqual([
      '[$start]',
    ])
  })

  it('does not report comparisons the index evaluates', () => {
    expect(
      rulesFor(
        '*[_type == "book" && dateTime(_createdAt) > dateTime("2020-01-01T00:00:00Z")][0...10]'
      )
    ).not.toContain('non-literal-comparison')
    expect(
      rulesFor(
        '*[_type == "author"][0...3]{ "n": count(*[_type == "book" && lower(title) == lower(^.name)]) }'
      )
    ).not.toContain('non-literal-comparison')
  })

  it('suggests the join-in-filter rewrite the index serves', () => {
    const [finding] = lint('*[_type == "book" && author->name == "Ada"][0...10]').filter(
      (f) => f.ruleId === 'join-in-filter'
    )
    expect(finding?.message).toContain('a._ref in *[b == "c"]._id')
    expect(finding?.message).not.toContain('count(')
  })

  it('does not report a join in an attribute array filter inside a projection', () => {
    expect(rulesFor('*[_type == "book"][0...3]{ "r": reviews[@->title == "x"] }')).not.toContain(
      'join-in-filter'
    )
  })

  it('counts repeated joins on the same reference once', () => {
    const fields = Array.from({ length: 11 }, (_, i) => `"a${i}": author->name`).join(', ')
    expect(rulesFor(`*[_type == "book"][0...10]{ ${fields} }`)).not.toContain('many-joins')
  })

  it.each([
    ['*[_type == "book" && upper(title) == "X"][0...10]', 'upper'],
    ['*[_type == "book" && length(title) > 10][0...10]', 'length'],
    ['*[_type == "book" && round(rating) == 4][0...10]', 'round'],
    ['*[_type == "book" && coalesce(subtitle, title) == "X"][0...10]', 'coalesce'],
    ['*[_type == "book" && select(rating > 3 => "a", "b") == "a"][0...10]', 'select'],
    [
      '*[_type == "book" && string::split(title, " ")[0] == "The"][0...10]',
      'string::split(title, " ")[0]',
    ],
    ['*[_type == "book" && defined(reviews[0])][0...10]', 'defined'],
  ])('reports an in-memory function in a filter: %s', (query, span) => {
    expect(spanText(query, 'computed-value-in-filter')).toEqual([span])
  })
})
