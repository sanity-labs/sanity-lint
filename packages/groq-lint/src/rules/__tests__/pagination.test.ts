import { RuleTester } from '@sanity-labs/lint-core/testing'
import { deepPagination } from '../deep-pagination'
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
    ],
  })
})

// NOTE: deep-pagination-param tests are skipped because groq-js doesn't support
// parameters in slice expressions (throws "slicing must use constant numbers")

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
    ],
  })
})
