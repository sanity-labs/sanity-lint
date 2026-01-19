import { RuleTester } from '@sanity-labs/lint-core/testing'
import { veryLargeQuery } from '../very-large-query'
import { extremelyLargeQuery } from '../extremely-large-query'

const tester = new RuleTester()

// Helper to create a query of approximately n bytes
function makeQuery(bytes: number): string {
  // Base query is about 30 bytes: *[_type == "x"]{ }
  const base = '*[_type == "test"]{'
  const end = '}'
  const overhead = base.length + end.length

  // Fill with field names
  const fields: string[] = []
  let currentSize = overhead
  let fieldNum = 0

  while (currentSize < bytes - 10) {
    const field = `field${fieldNum++}`
    fields.push(field)
    currentSize += field.length + 2 // +2 for ", "
  }

  return base + fields.join(', ') + end
}

describe('very-large-query', () => {
  tester.run('very-large-query', veryLargeQuery, {
    valid: [
      // Normal sized queries
      '*[_type == "post"]',
      '*[_type == "post"]{ title, body, author-> }',
      // Just under 10KB
      { name: 'query just under 10KB', code: makeQuery(10 * 1024 - 100) },
    ],
    invalid: [
      {
        name: 'query over 10KB',
        code: makeQuery(11 * 1024),
        errors: [{ ruleId: 'very-large-query', severity: 'warning' }],
      },
      {
        name: 'query around 50KB',
        code: makeQuery(50 * 1024),
        errors: [{ ruleId: 'very-large-query', severity: 'warning' }],
      },
    ],
  })
})

describe('extremely-large-query', () => {
  tester.run('extremely-large-query', extremelyLargeQuery, {
    valid: [
      // Normal sized queries
      '*[_type == "post"]',
      // Just under 100KB
      { name: 'query just under 100KB', code: makeQuery(100 * 1024 - 100) },
    ],
    invalid: [
      {
        name: 'query over 100KB',
        code: makeQuery(101 * 1024),
        errors: [{ ruleId: 'extremely-large-query', severity: 'error' }],
      },
      {
        name: 'query around 200KB',
        code: makeQuery(200 * 1024),
        errors: [{ ruleId: 'extremely-large-query', severity: 'error' }],
      },
    ],
  })
})
