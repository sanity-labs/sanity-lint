import { RuleTester } from '@sanity-labs/lint-core/testing'
import { computedValueInFilter } from '../computed-value-in-filter'

const tester = new RuleTester()

tester.run('computed-value-in-filter', computedValueInFilter, {
  valid: [
    // Simple comparisons
    '*[price > 100]',
    '*[_type == "product"]',

    // Parent reference exemption
    '*[total == ^.amount]',
    '*[price == ^.budget - 10]',

    // Arithmetic outside filter
    '*[_type == "product"]{ "total": price + tax }',

    // Literals only
    '*[value == 2 + 1]',
  ],

  invalid: [
    {
      name: 'addition in filter',
      code: '*[price + tax > 100]',
      errors: [{ ruleId: 'computed-value-in-filter', severity: 'warning' }],
    },
    {
      name: 'subtraction in filter',
      code: '*[total - discount < 50]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
    {
      name: 'multiplication in filter',
      code: '*[quantity * price > 1000]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
    {
      name: 'division in filter',
      code: '*[total / count < 10]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
  ],
})
