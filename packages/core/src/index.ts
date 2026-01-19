// Types
export type {
  Severity,
  Category,
  SourceLocation,
  SourceSpan,
  Suggestion,
  Finding,
  RuleContext,
  Rule,
  RuleConfig,
  LinterConfig,
} from './types'

// Re-export SchemaType from groq-js for convenience
export type { SchemaType } from 'groq-js'

// Reporting utilities
export { formatFindings, formatFindingsJson, summarizeFindings } from './reporter'
export type { FindingsSummary } from './reporter'

// Note: RuleTester is exported from '@sanity-labs/lint-core/testing' to avoid
// importing vitest in production code
