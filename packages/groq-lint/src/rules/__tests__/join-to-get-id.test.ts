import { RuleTester } from '@sanity-labs/lint-core/testing'
import { joinToGetId } from '../join-to-get-id'

const tester = new RuleTester()

tester.run('join-to-get-id', joinToGetId, {
  valid: [
    // Normal reference access
    '*[_type == "post"]{ "ref": author._ref }',

    // Using _id without dereference
    '*[_type == "post"]{ _id }',

    // Dereferencing to get other fields (OK)
    '*[_type == "post"]{ "name": author->name }',
    '*[_type == "post"]{ author->{ name, bio } }',

    // _id in a filter (not through deref)
    '*[_id == "abc123"]',

    // Nested but not through deref
    '*[_type == "post"]{ "authorRef": author._ref }',

    // Direct _id access without deref
    '*[_type == "post"].author._ref',
  ],

  invalid: [
    {
      name: 'aliased deref to _id',
      code: '*[_type == "post"]{ "authorId": author->_id }',
      errors: [{ ruleId: 'join-to-get-id', severity: 'info' }],
    },
    {
      name: 'direct map deref to _id',
      code: '*[_type == "post"].author->_id',
      errors: [{ ruleId: 'join-to-get-id', severity: 'info' }],
    },
    {
      name: 'nested deref to _id',
      code: '*[_type == "post"]{ "parentId": category->parent->_id }',
      errors: [{ ruleId: 'join-to-get-id' }],
    },
    {
      name: 'multiple derefs to _id in projection',
      code: '*[_type == "post"]{ "authorId": author->_id, "categoryId": category->_id }',
      errors: [{ ruleId: 'join-to-get-id' }, { ruleId: 'join-to-get-id' }],
    },
  ],
})
