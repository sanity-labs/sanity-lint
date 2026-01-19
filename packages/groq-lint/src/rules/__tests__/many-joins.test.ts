import { RuleTester } from '@sanity-labs/lint-core/testing'
import { manyJoins } from '../many-joins'

const tester = new RuleTester()

tester.run('many-joins', manyJoins, {
  valid: [
    // No joins
    '*[_type == "post"]',
    '*[_type == "post"]{ title, body }',

    // Few joins (under 10)
    '*[_type == "post"]{ author-> }',
    '*[_type == "post"]{ author->, category-> }',
    '*[_type == "post"]{ a->, b->, c->, d->, e-> }',

    // Exactly 10 joins (boundary)
    '*[_type == "post"]{ a->, b->, c->, d->, e->, f->, g->, h->, i->, j-> }',
  ],

  invalid: [
    {
      name: '11 joins',
      code: '*[_type == "post"]{ a->, b->, c->, d->, e->, f->, g->, h->, i->, j->, k-> }',
      errors: [{ ruleId: 'many-joins', severity: 'warning' }],
    },
    {
      name: '15 joins',
      code: '*[_type == "x"]{ a->, b->, c->, d->, e->, f->, g->, h->, i->, j->, k->, l->, m->, n->, o-> }',
      errors: [{ ruleId: 'many-joins', severity: 'warning' }],
    },
    {
      name: 'nested joins count too',
      code: '*[_type == "post"]{ author->{ company->{ ceo->{ spouse->{ employer->{ founder->{ mentor->{ advisor->{ partner->{ friend->{ colleague-> }}}}}}}}}}}',
      errors: [{ ruleId: 'many-joins', severity: 'warning' }],
    },
  ],
})
