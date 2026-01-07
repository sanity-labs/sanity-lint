import type { Finding, Severity } from '@sanity/lint-core'
import type { SchemaType, SchemaRule, SchemaLinterConfig, SchemaRuleContext } from './types'

export interface LintOptions {
  /** Specific rules to run (if not provided, runs all) */
  rules?: SchemaRule[]
  /** Configuration for rules */
  config?: SchemaLinterConfig
  /** File path for context */
  filePath?: string
}

export interface LintResult {
  /** The findings from all rules */
  findings: Finding[]
}

/**
 * Get effective severity for a rule based on config
 */
function getEffectiveSeverity(
  rule: SchemaRule,
  config: SchemaLinterConfig | undefined
): Severity | null {
  if (!config?.rules) {
    return rule.severity
  }

  const ruleConfig = config.rules[rule.id]

  if (ruleConfig === false) {
    return null // Disabled
  }

  if (ruleConfig === true) {
    return rule.severity
  }

  if (typeof ruleConfig === 'object') {
    if (ruleConfig.enabled === false) {
      return null
    }
    return ruleConfig.severity ?? rule.severity
  }

  return rule.severity
}

/**
 * Lint a schema type definition
 *
 * @param schema - The schema to lint
 * @param allRules - All available rules
 * @param options - Lint options
 * @returns Lint result with findings
 */
export function lint(
  schema: SchemaType,
  allRules: SchemaRule[],
  options: LintOptions = {}
): LintResult {
  const { rules = allRules, config, filePath = '' } = options

  // Track which rules have fired (for supersedes logic)
  const firedRules = new Set<string>()
  const allFindings: Finding[] = []

  for (const rule of rules) {
    const severity = getEffectiveSeverity(rule, config)

    // Skip disabled rules
    if (severity === null) {
      continue
    }

    const ruleFindings: Finding[] = []
    const context: SchemaRuleContext = {
      filePath,
      report: (finding) => {
        ruleFindings.push({
          ...finding,
          ruleId: rule.id,
          severity: finding.severity ?? severity,
        })
      },
    }

    try {
      rule.check(schema, context)
    } catch (error) {
      // Don't let one rule crash the whole linter
      console.error(`Rule ${rule.id} threw an error:`, error)
    }

    if (ruleFindings.length > 0) {
      firedRules.add(rule.id)
      allFindings.push(...ruleFindings)
    }
  }

  // Apply supersedes logic AFTER running all rules
  // Only filter out findings if a superseding rule actually fired
  const findings = allFindings.filter((finding) => {
    // Check if any rule that supersedes this finding's rule has fired
    const isSuperseded = rules.some(
      (r) => r.supersedes?.includes(finding.ruleId) && firedRules.has(r.id)
    )
    return !isSuperseded
  })

  return { findings }
}

/**
 * Lint multiple schema types
 */
export function lintSchemas(
  schemas: SchemaType[],
  allRules: SchemaRule[],
  options: LintOptions = {}
): LintResult {
  const findings: Finding[] = []

  for (const schema of schemas) {
    const result = lint(schema, allRules, options)
    findings.push(...result.findings)
  }

  return { findings }
}
