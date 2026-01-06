/**
 * ESLint plugin for Sanity
 *
 * This plugin provides rules for linting GROQ queries in JavaScript/TypeScript files.
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
 *   sanity.configs.recommended,
 * ]
 * ```
 */

import type { ESLint, Linter } from 'eslint'
import { rules as groqRules } from '@sanity/groq-lint'
import { createAllRules } from './utils/rule-factory'

// Create ESLint rules from all GROQ lint rules
const rules = createAllRules(groqRules)

// Build the plugin object
const plugin: ESLint.Plugin = {
  meta: {
    name: 'eslint-plugin-sanity',
    version: '0.0.1',
  },
  rules,
}

// Create recommended config
const recommended: Linter.Config = {
  plugins: {
    sanity: plugin,
  },
  rules: {
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
  },
}

// Create strict config (all rules as errors)
const strict: Linter.Config = {
  plugins: {
    sanity: plugin,
  },
  rules: Object.fromEntries(Object.keys(rules).map((ruleId) => [`sanity/${ruleId}`, 'error'])),
}

// Configs with explicit type annotation
const configs: { recommended: Linter.Config; strict: Linter.Config } = {
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
