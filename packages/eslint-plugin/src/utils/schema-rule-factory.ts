import type { Rule as ESLintRule } from 'eslint'
import type { TSESTree } from '@typescript-eslint/types'
import type { SchemaRule } from '@sanity-labs/schema-lint'
import { lint, rules as schemaRules } from '@sanity-labs/schema-lint'
import {
  isDefineTypeCall,
  extractSchemaFromDefineType,
  extractSchemaFromObject,
} from './schema-extractor'

/**
 * Create an ESLint rule from a schema lint rule.
 */
export function createSchemaESLintRule(schemaRule: SchemaRule): ESLintRule.RuleModule {
  return {
    meta: {
      type: schemaRule.category === 'correctness' ? 'problem' : 'suggestion',
      docs: {
        description: schemaRule.description,
        recommended: schemaRule.severity === 'error',
      },
      messages: {
        [schemaRule.id]: '{{ message }}',
      },
      schema: [], // No options for now
    },

    create(context) {
      return {
        // Handle defineType() calls
        CallExpression(eslintNode: ESLintRule.Node) {
          // Cast to our TSESTree type for type-safe property access
          const node = eslintNode as unknown as TSESTree.CallExpression
          if (!isDefineTypeCall(node)) {
            return
          }

          try {
            const schema = extractSchemaFromDefineType(node)
            if (!schema) {
              return
            }

            const result = lint(schema, schemaRules, {
              rules: [schemaRule],
              filePath: context.filename,
            })

            for (const finding of result.findings) {
              if (finding.ruleId === schemaRule.id) {
                context.report({
                  node: eslintNode,
                  messageId: schemaRule.id,
                  data: {
                    message: finding.help ? `${finding.message} ${finding.help}` : finding.message,
                  },
                })
              }
            }
          } catch {
            // Parse error - don't report
          }
        },

        // Handle export statements with object literals (not using defineType)
        ExportNamedDeclaration(eslintNode: ESLintRule.Node) {
          // Cast to our TSESTree type for type-safe property access
          const node = eslintNode as unknown as TSESTree.ExportNamedDeclaration

          // Only check the missing-define-type rule for non-defineType exports
          if (schemaRule.id !== 'missing-define-type') {
            return
          }

          if (!node.declaration) {
            return
          }

          // export const foo = { name: '...', type: '...' }
          if (node.declaration.type === 'VariableDeclaration') {
            for (const declarator of node.declaration.declarations) {
              if (
                declarator.init?.type === 'ObjectExpression' &&
                !isWrappedInDefineType(declarator.init)
              ) {
                const schema = extractSchemaFromObject(declarator.init)
                if (schema && (schema.type === 'document' || schema.type === 'object')) {
                  try {
                    const result = lint(schema, schemaRules, {
                      rules: [schemaRule],
                      filePath: context.filename,
                    })

                    for (const finding of result.findings) {
                      if (finding.ruleId === schemaRule.id) {
                        context.report({
                          node: eslintNode,
                          messageId: schemaRule.id,
                          data: {
                            message: finding.help
                              ? `${finding.message} ${finding.help}`
                              : finding.message,
                          },
                        })
                      }
                    }
                  } catch {
                    // Parse error - don't report
                  }
                }
              }
            }
          }
        },

        // Handle default exports with object literals
        ExportDefaultDeclaration(eslintNode: ESLintRule.Node) {
          // Cast to our TSESTree type for type-safe property access
          const node = eslintNode as unknown as TSESTree.ExportDefaultDeclaration

          // Only check the missing-define-type rule for non-defineType exports
          if (schemaRule.id !== 'missing-define-type') {
            return
          }

          if (node.declaration.type === 'ObjectExpression') {
            const schema = extractSchemaFromObject(node.declaration)
            if (schema && (schema.type === 'document' || schema.type === 'object')) {
              try {
                const result = lint(schema, schemaRules, {
                  rules: [schemaRule],
                  filePath: context.filename,
                })

                for (const finding of result.findings) {
                  if (finding.ruleId === schemaRule.id) {
                    context.report({
                      node: eslintNode,
                      messageId: schemaRule.id,
                      data: {
                        message: finding.help
                          ? `${finding.message} ${finding.help}`
                          : finding.message,
                      },
                    })
                  }
                }
              } catch {
                // Parse error - don't report
              }
            }
          }
        },
      }
    },
  }
}

/**
 * Check if an object expression's parent is a defineType() call
 */
function isWrappedInDefineType(_node: TSESTree.ObjectExpression): boolean {
  // This is a simplified check - in practice we check by seeing if
  // the parent is a CallExpression with defineType callee
  // For now we rely on the CallExpression handler
  return false
}

/**
 * Create all ESLint rules from schema lint rules.
 */
export function createAllSchemaRules(rules: SchemaRule[]): Record<string, ESLintRule.RuleModule> {
  const eslintRules: Record<string, ESLintRule.RuleModule> = {}

  for (const rule of rules) {
    // Use schema- prefix to distinguish from groq- rules
    const eslintRuleId = `schema-${rule.id}`
    eslintRules[eslintRuleId] = createSchemaESLintRule(rule)
  }

  return eslintRules
}
