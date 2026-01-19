import { RuleTester } from '@sanity-labs/lint-core/testing'
import { orderOnExpr } from '../order-on-expr'

const tester = new RuleTester()

tester.run('order-on-expr', orderOnExpr, {
  valid: [
    // Simple attribute ordering
    '*[_type == "post"] | order(title)',
    '*[_type == "post"] | order(publishedAt desc)',
    '*[_type == "post"] | order(_createdAt asc)',

    // Multiple attributes
    '*[_type == "post"] | order(category, title)',

    // Allowed function wrappers
    '*[_type == "post"] | order(lower(title))',
    '*[_type == "post"] | order(dateTime(publishedAt) desc)',

    // No order() call
    '*[_type == "post"][0...10]',
  ],

  invalid: [
    {
      name: 'arithmetic in order',
      code: '*[_type == "post"] | order(price + tax)',
      errors: [{ ruleId: 'order-on-expr', severity: 'warning' }],
    },
    {
      name: 'string concatenation in order',
      code: '*[_type == "post"] | order(firstName + lastName)',
      errors: [{ ruleId: 'order-on-expr' }],
    },
    {
      name: 'function call not in allowed list',
      code: '*[_type == "post"] | order(upper(title))',
      errors: [{ ruleId: 'order-on-expr' }],
    },
    {
      name: 'coalesce in order',
      code: '*[_type == "post"] | order(coalesce(publishedAt, _createdAt))',
      errors: [{ ruleId: 'order-on-expr' }],
    },
  ],
})
