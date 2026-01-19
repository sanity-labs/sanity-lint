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
  ],

  invalid: [
    {
      name: 'count with parent _id reference',
      code: '*[_type == "category"]{ "self": count(*[_id == ^._id]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery', severity: 'info' }],
    },
    {
      name: 'count with parent _ref reference',
      code: '*[_type == "category"]{ "posts": count(*[_type == "post" && category._ref == ^._id]) }',
      errors: [{ ruleId: 'count-in-correlated-subquery' }],
    },
  ],
})
