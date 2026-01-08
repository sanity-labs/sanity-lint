/**
 * ESLint plugin for Sanity
 *
 * This plugin provides rules for linting GROQ queries and schema definitions
 * in JavaScript/TypeScript files.
 *
 * @example
 * ```js
 * // eslint.config.js
 * import sanity from 'eslint-plugin-sanity'
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
 * import sanity from 'eslint-plugin-sanity'
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
    name: 'eslint-plugin-sanity',
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

      // === Schema Rules ===

      // Errors - correctness issues
      'sanity/schema-missing-define-type': 'error',
      'sanity/schema-missing-define-field': 'error',
      'sanity/schema-reserved-field-name': 'error',

      // Warnings - best practice violations
      'sanity/schema-missing-icon': 'warn',
      'sanity/schema-missing-title': 'warn',
      'sanity/schema-presentation-field-name': 'warn',
      'sanity/schema-missing-slug-source': 'warn',
      'sanity/schema-missing-required-validation': 'warn',
      'sanity/schema-heading-level-in-schema': 'warn',

      // Info - suggestions (off by default)
      'sanity/schema-missing-description': 'off',
      'sanity/schema-boolean-instead-of-list': 'off',
      'sanity/schema-array-missing-constraints': 'off',
      'sanity/schema-unnecessary-reference': 'off',
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

// Configs with explicit type annotation
const configs: { recommended: Linter.Config[]; strict: Linter.Config[] } = {
  recommended,
  strict,
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
