// Testing utilities - this file imports vitest
// Import from '@sanity-labs/lint-core/testing' in test files

export { RuleTester } from './rule-tester'
export type { ValidTestCase, InvalidTestCase, ExpectedError, RuleTests } from './rule-tester'

// GROQ validation utilities
// These use groq-js as the single source of truth for GROQ syntax validation
export { assertValidGroq, isValidGroq, parseGroq, type GroqParseError } from './groq-validator'
