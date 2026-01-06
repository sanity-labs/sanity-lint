import type { Rule as ESLintRule } from 'eslint'
import type { TSESTree } from '@typescript-eslint/types'
import type { Rule as GroqRule, Severity } from '@sanity/groq-lint'
import { lint } from '@sanity/groq-lint'
import { isGroqTaggedTemplate, extractGroqString } from './groq-extractor'

/**
 * Map GROQ lint severity to ESLint severity
 */
function mapSeverity(severity: Severity): 0 | 1 | 2 {
  switch (severity) {
    case 'error':
      return 2
    case 'warning':
      return 1
    case 'info':
      return 1 // ESLint doesn't have 'info', use warning
    default:
      return 1
  }
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
      return {
        TaggedTemplateExpression(node: TSESTree.TaggedTemplateExpression) {
          if (!isGroqTaggedTemplate(node)) {
            return
          }

          try {
            const query = extractGroqString(node)
            const result = lint(query, { rules: [groqRule] })

            for (const finding of result.findings) {
              if (finding.ruleId === groqRule.id) {
                context.report({
                  node: node as unknown as ESLintRule.Node,
                  messageId: groqRule.id,
                  data: {
                    message: finding.help
                      ? `${finding.message} ${finding.help}`
                      : finding.message,
                  },
                })
              }
            }
          } catch {
            // Parse error - don't report, let the user see it in runtime
          }
        },
      }
    },
  }
}

/**
 * Create all ESLint rules from GROQ lint rules.
 */
export function createAllRules(
  groqRules: GroqRule[]
): Record<string, ESLintRule.RuleModule> {
  const eslintRules: Record<string, ESLintRule.RuleModule> = {}

  for (const rule of groqRules) {
    // Convert rule ID from snake_case to kebab-case for ESLint convention
    const eslintRuleId = `groq-${rule.id}`
    eslintRules[eslintRuleId] = createESLintRule(rule)
  }

  return eslintRules
}
