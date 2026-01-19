import { RuleTester } from '@sanity-labs/lint-core/testing'
import { joinInFilter } from '../join-in-filter'

const tester = new RuleTester()

tester.run('join-in-filter', joinInFilter, {
  valid: [
    // No filter at all
    '*[_type == "post"]',

    // Filter with no join
    '*[_type == "post" && published == true]',

    // Join in projection (not filter) - this is fine
    '*[_type == "post"]{ title, author-> }',

    // Join in projection with nested projection
    '*[_type == "post"]{ title, author->{ name, bio } }',

    // Reference comparison (the recommended pattern)
    '*[_type == "post" && author._ref == $authorId]',

    // Complex filter without joins
    '*[_type == "post" && (status == "published" || featured == true)]',

    // Nested filter in projection (filter itself has no join)
    '*[_type == "author"]{ name, "posts": *[_type == "post" && author._ref == ^._id] }',

    // Join after filter
    '*[_type == "post"][0]->author',

    // Multiple projections with joins
    '*[_type == "post"]{ author-> }{ name }',
  ],

  invalid: [
    {
      name: 'simple join in filter',
      code: '*[author->name == "Bob"]',
      errors: [{ ruleId: 'join-in-filter' }],
    },
    {
      name: 'join in filter with type check',
      code: '*[_type == "post" && author->role == "editor"]',
      errors: [{ ruleId: 'join-in-filter' }],
    },
    {
      name: 'multiple joins in same filter',
      code: '*[author->name == "Bob" && category->slug == "tech"]',
      errors: [{ ruleId: 'join-in-filter' }, { ruleId: 'join-in-filter' }],
    },
    {
      name: 'nested join in filter',
      code: '*[author->employer->name == "Sanity"]',
      errors: [
        { ruleId: 'join-in-filter' }, // author->employer
        { ruleId: 'join-in-filter' }, // employer->name (inside the first deref)
      ],
    },
    {
      name: 'join in nested filter (subquery)',
      code: '*[_type == "author"]{ "posts": *[_type == "post" && category->featured == true] }',
      errors: [{ ruleId: 'join-in-filter' }],
    },
    {
      name: 'join in filter with OR',
      code: '*[author->active == true || editor->active == true]',
      errors: [{ ruleId: 'join-in-filter' }, { ruleId: 'join-in-filter' }],
    },
    {
      name: 'join with comparison operators',
      code: '*[author->age > 30]',
      errors: [{ ruleId: 'join-in-filter' }],
    },
    {
      name: 'join in defined() check in filter',
      code: '*[defined(author->bio)]',
      errors: [{ ruleId: 'join-in-filter' }],
    },
  ],
})
