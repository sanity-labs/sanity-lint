import type { Rule as ESLintRule } from 'eslint'
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule as GroqRule } from '@sanity/groq-lint'
import { lint, rules as allGroqRules } from '@sanity/groq-lint'
import {
  isGroqTaggedTemplate,
  extractGroqString,
  isGroqFunctionCall,
  extractGroqStringFromCall,
} from './groq-extractor'
import { getSchemaFromSettings } from './schema-cache'

/**
 * Build a config that enables only the specified rule
 */
function buildSingleRuleConfig(ruleId: string): Record<string, boolean> {
  const config: Record<string, boolean> = {}
  for (const rule of allGroqRules) {
    config[rule.id] = rule.id === ruleId
  }
  return config
}

/**
 * Create an ESLint rule from a GROQ lint rule.
 */
export function createESLintRule(groqRule: GroqRule): ESLintRule.RuleModule {
  return {
    meta: {
      type: groqRule.category === 'correctness' ? 'problem' : 'suggestion',
      docs: {
        description: groqRule.description,
        recommended: groqRule.severity === 'error',
      },
      messages: {
        [groqRule.id]: '{{ message }}',
      },
      schema: [], // No options for now
    },

    create(context) {
      // Load schema from settings if configured (for schema-aware rules)
      const schema = getSchemaFromSettings(
        context.settings as Record<string, unknown> | undefined,
        context.filename,
        context.cwd
      )

      // Skip schema-requiring rules if no schema is available
      if (groqRule.requiresSchema && !schema) {
        return {}
      }

      /**
       * Lint a GROQ query and report findings
       */
      function lintQuery(query: string, eslintNode: ESLintRule.Node): void {
        try {
          const options = schema
            ? { config: { rules: buildSingleRuleConfig(groqRule.id) }, schema }
            : { config: { rules: buildSingleRuleConfig(groqRule.id) } }
          const result = lint(query, options)

          for (const finding of result.findings) {
            if (finding.ruleId === groqRule.id) {
              context.report({
                node: eslintNode,
                messageId: groqRule.id,
                data: {
                  message: finding.help ? `${finding.message} ${finding.help}` : finding.message,
                },
              })
            }
          }
        } catch {
          // Parse error - don't report, let the user see it in runtime
        }
      }

      return {
        // Handle groq`...` tagged template literals
        TaggedTemplateExpression(eslintNode: ESLintRule.Node) {
          const node = eslintNode as unknown as TSESTree.TaggedTemplateExpression
          if (!isGroqTaggedTemplate(node)) {
            return
          }

          const query = extractGroqString(node)
          lintQuery(query, eslintNode)
        },

        // Handle defineQuery(`...`) and defineQuery("...") function calls
        CallExpression(eslintNode: ESLintRule.Node) {
          const node = eslintNode as unknown as TSESTree.CallExpression
          if (!isGroqFunctionCall(node)) {
            return
          }

          const query = extractGroqStringFromCall(node)
          if (query !== null) {
            lintQuery(query, eslintNode)
          }
        },
      }
    },
  }
}

/**
 * Create all ESLint rules from GROQ lint rules.
 */
export function createAllRules(groqRules: GroqRule[]): Record<string, ESLintRule.RuleModule> {
  const eslintRules: Record<string, ESLintRule.RuleModule> = {}

  for (const rule of groqRules) {
    // Convert rule ID from snake_case to kebab-case for ESLint convention
    const eslintRuleId = `groq-${rule.id}`
    eslintRules[eslintRuleId] = createESLintRule(rule)
  }

  return eslintRules
}
