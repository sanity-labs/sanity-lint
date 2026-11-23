import { describe } from 'vitest'
import { RuleTester } from '@sanity-labs/lint-core/testing'
import { deepPagination } from '../deep-pagination'
import { deepPaginationParam } from '../deep-pagination-param'
import { largePages } from '../large-pages'

const tester = new RuleTester()

describe('deep-pagination', () => {
  tester.run('deep-pagination', deepPagination, {
    valid: [
      // Normal pagination
      '*[_type == "post"][0...10]',
      '*[_type == "post"][0...100]',

      // Offset under threshold
      '*[_type == "post"][500...510]',
      '*[_type == "post"][999...1010]',

      // Single element access
      '*[_type == "post"][0]',
      '*[_type == "post"][99]',

      // Slices of one document's attribute array are taken in memory
      '*[_type == "book"][0...10]{ "r": reviewsInline[1500..1600] }',
      '*[_type == "book"][0...10]{ "r": reviewsInline[200000...200010] }',
      '*[_type == "book"][0...10]{ "r": reviews[1500..1600]->title }',
      '*[_type == "book"][0...10]{ "r": reviews[5000] }',
    ],

    invalid: [
      {
        name: 'offset of 1000',
        code: '*[_type == "post"][1000...1010]',
        errors: [{ ruleId: 'deep-pagination' }],
      },
      {
        name: 'offset of 5000',
        code: '*[_type == "post"][5000...5100]',
        errors: [{ ruleId: 'deep-pagination' }],
      },
      {
        name: 'very deep offset',
        code: '*[_type == "post"][100000...100100]',
        errors: [{ ruleId: 'deep-pagination' }],
      },
      {
        name: 'deep offset after order',
        code: '*[_type == "post"] | order(title)[2000...2010]',
        errors: [{ ruleId: 'deep-pagination' }],
      },
      {
        name: 'deep offset after projection',
        code: '*[_type == "post"]{ title }[1000...1010]',
        errors: [{ ruleId: 'deep-pagination' }],
      },
      {
        name: 'deep element access',
        code: '*[_type == "post"][5000]{ title }',
        errors: [{ ruleId: 'deep-pagination' }],
      },
    ],
  })
})

// groq-js doesn't support parameters in slice expressions (throws "slicing
// must use constant numbers"), so only element access with a parameter is covered.
describe('deep-pagination-param', () => {
  tester.run('deep-pagination-param', deepPaginationParam, {
    valid: [
      '*[_type == "post"][0...10]',
      '*[_type == "post"][_id == $id]',
      '*[_type == "book"][0...10]{ "r": reviewsInline[$start] }',
    ],

    invalid: [
      {
        name: 'element access with a parameter',
        code: '*[_type == "post"][$start]',
        errors: [{ ruleId: 'deep-pagination-param', severity: 'info' }],
      },
    ],
  })
})

describe('large-pages', () => {
  tester.run('large-pages', largePages, {
    valid: [
      // Small page sizes
      '*[_type == "post"][0...10]',
      '*[_type == "post"][0...50]',
      '*[_type == "post"][0...100]',

      // Non-zero start (not flagged by this rule)
      '*[_type == "post"][50...200]',

      // Single document
      '*[_type == "post"][0]',

      // Slice of one document's attribute array
      '*[_type == "book"][0...10]{ "r": reviewsInline[0..200] }',
    ],

    invalid: [
      {
        name: 'page size of 101',
        code: '*[_type == "post"][0...101]',
        errors: [{ ruleId: 'large-pages', severity: 'warning' }],
      },
      {
        name: 'page size of 500',
        code: '*[_type == "post"][0...500]',
        errors: [{ ruleId: 'large-pages' }],
      },
      {
        name: 'page size of 1000',
        code: '*[_type == "post"][0...1000]',
        errors: [{ ruleId: 'large-pages' }],
      },
      {
        name: 'large page after projection',
        code: '*[_type == "post"]{ title }[0..200]',
        errors: [{ ruleId: 'large-pages' }],
      },
    ],
  })
})
