import { describe, it, expect } from 'vitest'
import type { Finding } from '@sanity-labs/lint-core'
import type { SchemaType, SchemaRule, SchemaRuleContext } from './types'

/**
 * A valid test case - schema that should produce no findings
 */
export interface ValidSchemaTestCase {
  /** The schema to test */
  schema: SchemaType
  /** Optional name for the test */
  name?: string
}

/**
 * Expected error in an invalid test case
 */
export interface ExpectedSchemaError {
  /** Expected rule ID (defaults to the rule being tested) */
  ruleId?: string
  /** Expected message (string for exact match, RegExp for pattern) */
  message?: string | RegExp
  /** Expected severity */
  severity?: 'error' | 'warning' | 'info'
}

/**
 * An invalid test case - schema that should produce findings
 */
export interface InvalidSchemaTestCase {
  /** The schema to test */
  schema: SchemaType
  /** Optional name for the test */
  name?: string
  /** Expected errors */
  errors: ExpectedSchemaError[]
}

/**
 * Test suite for a schema rule
 */
export interface SchemaRuleTests {
  /** Schemas that should produce no findings */
  valid: (SchemaType | ValidSchemaTestCase)[]
  /** Schemas that should produce findings */
  invalid: InvalidSchemaTestCase[]
}

/**
 * Run a single schema rule against a schema and collect findings
 */
function runSchemaRule(rule: SchemaRule, schema: SchemaType): Finding[] {
  const findings: Finding[] = []

  const context: SchemaRuleContext = {
    filePath: 'test.ts',
    report: (finding) => {
      findings.push({
        ...finding,
        ruleId: rule.id,
      })
    },
  }

  rule.check(schema, context)

  return findings
}

/**
 * Assert that a finding matches expected error
 */
function assertFindingMatches(
  finding: Finding,
  expected: ExpectedSchemaError,
  ruleId: string
): void {
  // Check rule ID
  const expectedRuleId = expected.ruleId ?? ruleId
  expect(finding.ruleId).toBe(expectedRuleId)

  // Check message if specified
  if (expected.message !== undefined) {
    if (typeof expected.message === 'string') {
      expect(finding.message).toBe(expected.message)
    } else {
      expect(finding.message).toMatch(expected.message)
    }
  }

  // Check severity if specified
  if (expected.severity !== undefined) {
    expect(finding.severity).toBe(expected.severity)
  }
}

/**
 * Helper to create a minimal valid schema for testing
 */
export function createSchema(overrides: Partial<SchemaType> = {}): SchemaType {
  return {
    name: 'testType',
    type: 'document',
    usesDefineType: true,
    usesDefineField: true,
    ...overrides,
  }
}

/**
 * Test utility for schema lint rules, inspired by ESLint's RuleTester
 *
 * @example
 * ```typescript
 * import { SchemaRuleTester, createSchema } from '@sanity-labs/schema-lint/testing'
 * import { missingIcon } from '../missing-icon'
 *
 * const tester = new SchemaRuleTester()
 *
 * tester.run('missing-icon', missingIcon, {
 *   valid: [
 *     createSchema({ hasIcon: true }),
 *   ],
 *   invalid: [
 *     {
 *       schema: createSchema({ hasIcon: false }),
 *       errors: [{ ruleId: 'missing-icon' }]
 *     }
 *   ]
 * })
 * ```
 */
export class SchemaRuleTester {
  /**
   * Run tests for a schema rule
   * @param ruleName - Name for the test suite
   * @param rule - The rule to test
   * @param tests - Valid and invalid test cases
   */
  run(ruleName: string, rule: SchemaRule, tests: SchemaRuleTests): void {
    describe(ruleName, () => {
      describe('valid', () => {
        for (const test of tests.valid) {
          const testCase = 'schema' in test ? test : { schema: test }
          const testName = testCase.name ?? `${testCase.schema.name} (${testCase.schema.type})`

          it(testName, () => {
            const findings = runSchemaRule(rule, testCase.schema)
            expect(findings).toHaveLength(0)
          })
        }
      })

      describe('invalid', () => {
        for (const test of tests.invalid) {
          const testName = test.name ?? `${test.schema.name} (${test.schema.type})`

          it(testName, () => {
            const findings = runSchemaRule(rule, test.schema)

            // Check we got the expected number of errors
            expect(findings).toHaveLength(test.errors.length)

            // Check each error matches
            for (let i = 0; i < test.errors.length; i++) {
              const finding = findings[i]
              const expected = test.errors[i]
              if (finding && expected) {
                assertFindingMatches(finding, expected, rule.id)
              }
            }
          })
        }
      })
    })
  }
}
