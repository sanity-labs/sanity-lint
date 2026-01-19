import { RuleTester } from '@sanity-labs/lint-core/testing'
import { matchOnId } from '../match-on-id'

const tester = new RuleTester()

tester.run('match-on-id', matchOnId, {
  valid: [
    // Normal _id comparison
    '*[_id == "doc-123"]',

    // Match on other fields
    '*[title match "hello*"]',
    '*[body match "search term"]',

    // _type is fine
    '*[_type match "post*"]',
  ],

  invalid: [
    {
      name: 'match on _id with wildcard',
      code: '*[_id match "prefix*"]',
      errors: [{ ruleId: 'match-on-id', severity: 'info' }],
    },
    {
      name: 'match on _id exact',
      code: '*[_id match "doc-123"]',
      errors: [{ ruleId: 'match-on-id' }],
    },
  ],
})
