import { describe, it, expect } from 'vitest'
import { parse } from 'groq-js'
import type { Rule, Finding, RuleContext } from './types'

/**
 * A valid test case - query that should produce no findings
 */
export interface ValidTestCase {
  /** The GROQ query to test */
  code: string
  /** Optional name for the test */
  name?: string
}

/**
 * Expected error in an invalid test case
 */
export interface ExpectedError {
  /** Expected rule ID (defaults to the rule being tested) */
  ruleId?: string
  /** Expected message (string for exact match, RegExp for pattern) */
  message?: string | RegExp
  /** Expected severity */
  severity?: 'error' | 'warning' | 'info'
  /** Expected line number (1-based) */
  line?: number
  /** Expected column number (1-based) */
  column?: number
}

/**
 * An invalid test case - query that should produce findings
 */
export interface InvalidTestCase {
  /** The GROQ query to test */
  code: string
  /** Optional name for the test */
  name?: string
  /** Expected errors */
  errors: ExpectedError[]
}

/**
 * Test suite for a rule
 */
export interface RuleTests {
  /** Queries that should produce no findings */
  valid: (string | ValidTestCase)[]
  /** Queries that should produce findings */
  invalid: InvalidTestCase[]
}

/**
 * Run a single rule against a query and collect findings
 */
function runRule(rule: Rule, query: string): Finding[] {
  const findings: Finding[] = []

  let ast
  try {
    ast = parse(query)
  } catch {
    // If query doesn't parse, return empty findings
    // (parser errors are separate from lint errors)
    return []
  }

  const context: RuleContext = {
    query,
    queryLength: query.length,
    report: (finding) => {
      findings.push({
        ...finding,
        ruleId: rule.id,
      })
    },
  }

  rule.check(ast, context)

  return findings
}

/**
 * Assert that a finding matches expected error
 */
function assertFindingMatches(finding: Finding, expected: ExpectedError, ruleId: string): void {
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

  // Check location if specified
  if (expected.line !== undefined && finding.span) {
    expect(finding.span.start.line).toBe(expected.line)
  }
  if (expected.column !== undefined && finding.span) {
    expect(finding.span.start.column).toBe(expected.column)
  }
}

/**
 * Test utility for lint rules, inspired by ESLint's RuleTester
 *
 * @example
 * ```typescript
 * import { RuleTester } from '@sanity-labs/lint-core'
 * import { joinInFilter } from '../join-in-filter'
 *
 * const tester = new RuleTester()
 *
 * tester.run('join-in-filter', joinInFilter, {
 *   valid: [
 *     '*[_type == "post"]',
 *     '*[_type == "post"]{ author-> }',
 *   ],
 *   invalid: [
 *     {
 *       code: '*[author->name == "Bob"]',
 *       errors: [{ ruleId: 'join-in-filter' }]
 *     }
 *   ]
 * })
 * ```
 */
export class RuleTester {
  /**
   * Run tests for a rule
   * @param ruleName - Name for the test suite
   * @param rule - The rule to test
   * @param tests - Valid and invalid test cases
   */
  run(ruleName: string, rule: Rule, tests: RuleTests): void {
    describe(ruleName, () => {
      describe('valid', () => {
        for (const test of tests.valid) {
          const testCase = typeof test === 'string' ? { code: test } : test
          const testName = testCase.name ?? this.truncate(testCase.code, 60)

          it(testName, () => {
            const findings = runRule(rule, testCase.code)
            expect(findings).toHaveLength(0)
          })
        }
      })

      describe('invalid', () => {
        for (const test of tests.invalid) {
          const testName = test.name ?? this.truncate(test.code, 60)

          it(testName, () => {
            const findings = runRule(rule, test.code)

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

  /**
   * Truncate a string for display
   */
  private truncate(str: string, maxLength: number): string {
    const oneLine = str.replace(/\s+/g, ' ').trim()
    if (oneLine.length <= maxLength) {
      return oneLine
    }
    return oneLine.slice(0, maxLength - 3) + '...'
  }
}
