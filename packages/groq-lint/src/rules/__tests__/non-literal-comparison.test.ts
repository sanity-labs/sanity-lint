import { RuleTester } from '@sanity-labs/lint-core/testing'
import { nonLiteralComparison } from '../non-literal-comparison'

const tester = new RuleTester()

tester.run('non-literal-comparison', nonLiteralComparison, {
  valid: [
    // Attribute vs literal
    '*[price > 100]',
    '*[name == "test"]',
    '*[_type == "post"]',

    // Attribute vs parameter
    '*[price > $minPrice]',

    // Attribute vs now()
    '*[publishedAt < now()]',

    // Parent reference exemption
    '*[price == ^.budget]',
    '*[category._ref == ^.category._ref]',

    // Literal vs literal
    '*[2 + 1 == 3]',

    // Outside filter
    '*[_type == "post"]{ "match": a == b }',

    // The index evaluates dateTime() of a literal
    '*[_type == "book" && dateTime(_createdAt) > dateTime("2020-01-01T00:00:00Z")]',

    // A coercion of ^ is a batch key
    '*[_type == "author"]{ "n": count(*[_type == "book" && lower(title) == lower(^.name)]) }',
  ],

  invalid: [
    {
      name: 'two attributes compared',
      code: '*[startDate > endDate]',
      errors: [{ ruleId: 'non-literal-comparison', severity: 'warning' }],
    },
    {
      name: 'attribute equality',
      code: '*[a == b]',
      errors: [{ ruleId: 'non-literal-comparison' }],
    },
    {
      name: 'dateTime() of two attributes',
      code: '*[dateTime(_createdAt) > dateTime(_updatedAt)]',
      errors: [{ ruleId: 'non-literal-comparison' }],
    },
    {
      name: 'lower() of two attributes',
      code: '*[lower(title) == lower(subtitle)]',
      errors: [{ ruleId: 'non-literal-comparison' }],
    },
    {
      name: 'nested attribute comparison',
      code: '*[author.name == editor.name]',
      errors: [{ ruleId: 'non-literal-comparison' }],
    },
  ],
})
