/**
 * ESLint plugin for Sanity
 *
 * This plugin provides rules for linting GROQ queries and schema definitions
 * in JavaScript/TypeScript files.
 *
 * @example
 * ```js
 * // eslint.config.js
 * import sanity from '@sanity/eslint-plugin'
 *
 * export default [
 *   {
 *     plugins: { sanity },
 *     rules: {
 *       'sanity/groq-join-in-filter': 'error',
 *       'sanity/schema-missing-icon': 'warn',
 *     },
 *   },
 * ]
 * ```
 *
 * Or use the recommended config:
 * ```js
 * import sanity from '@sanity/eslint-plugin'
 *
 * export default [
 *   ...sanity.configs.recommended,
 * ]
 * ```
 */

import type { ESLint, Linter } from 'eslint'
import { rules as groqRules } from '@sanity/groq-lint'
import { rules as schemaRules } from '@sanity/schema-lint'
import { createAllRules } from './utils/rule-factory'
import { createAllSchemaRules } from './utils/schema-rule-factory'

// Version is injected at build time by tsup
declare const PACKAGE_VERSION: string
const version = typeof PACKAGE_VERSION !== 'undefined' ? PACKAGE_VERSION : '0.0.0'

// Create ESLint rules from all GROQ lint rules
const groqEslintRules = createAllRules(groqRules)

// Create ESLint rules from all schema lint rules
const schemaEslintRules = createAllSchemaRules(schemaRules)

// Combine all rules
const rules = {
  ...groqEslintRules,
  ...schemaEslintRules,
}

// Build the plugin object
const plugin: ESLint.Plugin = {
  meta: {
    name: '@sanity/eslint-plugin',
    version,
  },
  rules,
}

// Create recommended config as an array for easy spreading
// Users can use either: ...sanity.configs.recommended or sanity.configs.recommended
const recommended: Linter.Config[] = [
  {
    // Apply to all JS/TS files by default so it works out of the box
    // Includes Astro and Svelte for parity with Sanity TypeGen
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,astro,svelte}'],
    plugins: {
      sanity: plugin,
    },
    rules: {
      // === GROQ Rules ===

      // Errors - these are serious performance or correctness issues
      'sanity/groq-join-in-filter': 'error',

      // Warnings - performance issues that should be addressed
      'sanity/groq-deep-pagination': 'warn',
      'sanity/groq-large-pages': 'warn',
      'sanity/groq-many-joins': 'warn',
      'sanity/groq-computed-value-in-filter': 'warn',
      'sanity/groq-non-literal-comparison': 'warn',
      'sanity/groq-order-on-expr': 'warn',
      'sanity/groq-very-large-query': 'warn',
      'sanity/groq-extremely-large-query': 'error',

      // Info - suggestions for improvement (off by default, enable as warnings)
      'sanity/groq-join-to-get-id': 'warn',
      'sanity/groq-repeated-dereference': 'warn',
      'sanity/groq-match-on-id': 'warn',
      'sanity/groq-count-in-correlated-subquery': 'warn',
      'sanity/groq-deep-pagination-param': 'warn',

      // Schema-aware rules (require settings.sanity.schemaPath to be set)
      // These silently skip if no schema is configured
      'sanity/groq-invalid-type-filter': 'error',
      'sanity/groq-unknown-field': 'warn',

      // === Schema Rules ===

      // Errors - correctness issues
      'sanity/schema-missing-define-type': 'error',
      'sanity/schema-missing-define-field': 'error',
      'sanity/schema-reserved-field-name': 'error',

      // Warnings - best practice violations
      'sanity/schema-missing-icon': 'warn',
      'sanity/schema-missing-title': 'warn',
      'sanity/schema-missing-slug-source': 'warn',
      'sanity/schema-heading-level-in-schema': 'warn',

      // Info - suggestions (off by default)
      'sanity/schema-missing-description': 'off',
      'sanity/schema-boolean-instead-of-list': 'off',
      'sanity/schema-array-missing-constraints': 'off',
      'sanity/schema-unnecessary-reference': 'off',
      'sanity/schema-presentation-field-name': 'off',
      'sanity/schema-missing-required-validation': 'off',
    },
  },
]

// Create strict config (all rules as errors)
const strict: Linter.Config[] = [
  {
    // Apply to all JS/TS files by default so it works out of the box
    // Includes Astro and Svelte for parity with Sanity TypeGen
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,astro,svelte}'],
    plugins: {
      sanity: plugin,
    },
    rules: Object.fromEntries(Object.keys(rules).map((ruleId) => [`sanity/${ruleId}`, 'error'])),
  },
]

// GROQ-only config - for frontends, functions, anywhere you write GROQ queries
const groq: Linter.Config[] = [
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,astro,svelte}'],
    plugins: {
      sanity: plugin,
    },
    rules: {
      // Errors - serious performance or correctness issues
      'sanity/groq-join-in-filter': 'error',
      'sanity/groq-extremely-large-query': 'error',

      // Warnings - performance issues
      'sanity/groq-deep-pagination': 'warn',
      'sanity/groq-large-pages': 'warn',
      'sanity/groq-many-joins': 'warn',
      'sanity/groq-computed-value-in-filter': 'warn',
      'sanity/groq-non-literal-comparison': 'warn',
      'sanity/groq-order-on-expr': 'warn',
      'sanity/groq-very-large-query': 'warn',
      'sanity/groq-join-to-get-id': 'warn',
      'sanity/groq-repeated-dereference': 'warn',
      'sanity/groq-match-on-id': 'warn',
      'sanity/groq-count-in-correlated-subquery': 'warn',
      'sanity/groq-deep-pagination-param': 'warn',
    },
  },
]

// Schema-only config - for schema packages in monorepos
const schema: Linter.Config[] = [
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,astro,svelte}'],
    plugins: {
      sanity: plugin,
    },
    rules: {
      // Errors - correctness issues
      'sanity/schema-missing-define-type': 'error',
      'sanity/schema-missing-define-field': 'error',
      'sanity/schema-reserved-field-name': 'error',

      // Warnings - best practice violations
      'sanity/schema-missing-icon': 'warn',
      'sanity/schema-missing-title': 'warn',
      'sanity/schema-missing-slug-source': 'warn',
      'sanity/schema-heading-level-in-schema': 'warn',

      // Off by default - enable as needed
      'sanity/schema-missing-description': 'off',
      'sanity/schema-boolean-instead-of-list': 'off',
      'sanity/schema-array-missing-constraints': 'off',
      'sanity/schema-unnecessary-reference': 'off',
      'sanity/schema-presentation-field-name': 'off',
      'sanity/schema-missing-required-validation': 'off',
    },
  },
]

// Performance-focused config - only performance-related GROQ rules
const performance: Linter.Config[] = [
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,astro,svelte}'],
    plugins: {
      sanity: plugin,
    },
    rules: {
      // Critical performance issues
      'sanity/groq-join-in-filter': 'error',
      'sanity/groq-extremely-large-query': 'error',

      // Performance warnings
      'sanity/groq-deep-pagination': 'warn',
      'sanity/groq-large-pages': 'warn',
      'sanity/groq-many-joins': 'warn',
      'sanity/groq-computed-value-in-filter': 'warn',
      'sanity/groq-very-large-query': 'warn',
    },
  },
]

// Configs with explicit type annotation
const configs: {
  recommended: Linter.Config[]
  strict: Linter.Config[]
  groq: Linter.Config[]
  schema: Linter.Config[]
  performance: Linter.Config[]
} = {
  recommended,
  strict,
  groq,
  schema,
  performance,
}

// Plugin type
interface SanityPlugin {
  meta: ESLint.Plugin['meta']
  rules: typeof rules
  configs: typeof configs
}

// Default export for ESLint flat config
const sanityPlugin: SanityPlugin = {
  meta: plugin.meta,
  rules,
  configs,
}

export default sanityPlugin

// Named exports for flexibility
export { rules, configs }
