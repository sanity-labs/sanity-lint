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
      name: 'nested attribute comparison',
      code: '*[author.name == editor.name]',
      errors: [{ ruleId: 'non-literal-comparison' }],
    },
  ],
})
