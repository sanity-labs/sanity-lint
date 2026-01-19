import { RuleTester } from '@sanity-labs/lint-core/testing'
import { repeatedDereference } from '../repeated-dereference'

const tester = new RuleTester()

tester.run('repeated-dereference', repeatedDereference, {
  valid: [
    // Single dereference
    '*[_type == "post"]{ author->name }',

    // Different references dereferenced
    '*[_type == "post"]{ "authorName": author->name, "categoryName": category->name }',

    // Sub-projection (efficient)
    '*[_type == "post"]{ author->{ name, bio, email } }',

    // No projection
    '*[_type == "post"].author->name',
  ],

  invalid: [
    {
      name: 'same reference dereferenced twice',
      code: '*[_type == "post"]{ "authorName": author->name, "authorBio": author->bio }',
      errors: [{ ruleId: 'repeated-dereference', severity: 'info' }],
    },
    {
      name: 'same reference dereferenced three times',
      code: '*[_type == "post"]{ "name": author->name, "bio": author->bio, "email": author->email }',
      errors: [{ ruleId: 'repeated-dereference' }],
    },
  ],
})
