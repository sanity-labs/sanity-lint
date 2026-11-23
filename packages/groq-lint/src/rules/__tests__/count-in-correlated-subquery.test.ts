import { RuleTester } from '@sanity-labs/lint-core/testing'
import { countInCorrelatedSubquery } from '../count-in-correlated-subquery'

const tester = new RuleTester()

tester.run('count-in-correlated-subquery', countInCorrelatedSubquery, {
  valid: [
    // Non-correlated count
    'count(*[_type == "post"])',

    // Count on array
    '*[_type == "post"]{ "tagCount": count(tags) }',

    // Filter without parent reference
    '*[_type == "category"]{ "postCount": count(*[_type == "post"]) }',

    // Equality on ^ is batched into one index read
    '*[_type == "author"][0...3]{ name, "books": count(*[_type == "book" && author._ref == ^._id]) }',
    '*[_type == "category"]{ "self": count(*[_id == ^._id]) }',
    '*[_type == "category"]{ "self": count(*[^._id == category._ref]) }',
    '*[_type == "author"]{ "n": count(*[_type == "book" && lower(title) == lower(^.name)]) }',

    // references(^._id) is batched
    '*[_type == "author"]{ "n": count(*[references(^._id)]) }',
    '*[_type == "author"]{ "n": count(*[_type == "book" && references(^._id)]) }',

    // Projected, ordered or sliced equality subqueries are batched
    '*[_type == "author"]{ "n": count(*[author._ref == ^._id]{ title }) }',
    '*[_type == "author"]{ "n": count(*[author._ref == ^._id] | order(title)) }',
    '*[_type == "author"]{ "n": count(*[author._ref == ^._id][0...10]) }',

    // In filters and order
    '*[_type == "author" && count(*[_type == "book" && author._ref == ^._id]) > 2]',
    '*[_type == "author"] | order(count(*[_type == "book" && author._ref == ^._id]) desc)',
  ],

  invalid: [
    {
      name: 'greater-than on parent',
      code: '*[_type == "book"]{ "newer": count(*[_type == "book" && _createdAt > ^._createdAt]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery', severity: 'info' }],
    },
    {
      name: 'parent in array',
      code: '*[_type == "author"]{ "n": count(*[_type == "book" && ^._id in reviews[]._ref]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
    {
      name: 'match on parent',
      code: '*[_type == "author"]{ "n": count(*[_type == "book" && title match ^.name]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
    {
      name: 'or over parent equalities',
      code: '*[_type == "author"]{ "n": count(*[author._ref == ^._id || editor._ref == ^._id]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
    {
      name: 'non-equality after flatten',
      code: '*[_type == "book"]{ "n": count(*[][_createdAt > ^._createdAt]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
    {
      name: 'non-equality next to an equality',
      code: '*[_type == "author"]{ "n": count(*[author._ref == ^._id && _createdAt > ^._createdAt]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
  ],
})
