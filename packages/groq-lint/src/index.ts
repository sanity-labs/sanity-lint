// Main linting API
export { initLinter, lint, lintMany } from './linter'
export type { LintResult, LintOptions } from './linter'

// WASM utilities
export { isWasmAvailable, WASM_RULES } from './wasm-linter'

// Rules
export { rules, rulesById } from './rules'
export { joinInFilter } from './rules/join-in-filter'

// Re-export types from core
export type {
  Rule,
  RuleConfig,
  LinterConfig,
  Finding,
  Suggestion,
  Severity,
  Category,
  SchemaType,
} from '@sanity/lint-core'

// Re-export utilities from core
export { formatFindings, formatFindingsJson, summarizeFindings } from '@sanity/lint-core'

// Note: RuleTester is available from '@sanity/lint-core/testing' for test files
// Note: Schema utilities (loadSchema, findSchemaPath, etc.) are available from '@sanity/groq-lint/schema'
//       They are in a separate entry point because they use Node.js APIs
