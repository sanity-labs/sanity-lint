import { parse, type SchemaType } from 'groq-js'
import type { Finding, Rule, RuleContext, LinterConfig } from '@sanity-labs/lint-core'
import { rules as allRules } from './rules'
import { initWasmLinter, isWasmAvailable, isWasmRule, lintWithWasm } from './wasm-linter'

/**
 * Result of linting a query
 */
export interface LintResult {
  /** The query that was linted */
  query: string
  /** Findings from the lint rules */
  findings: Finding[]
  /** Whether parsing failed */
  parseError?: string
}

/**
 * Options for linting
 */
export interface LintOptions {
  /** Linter configuration */
  config?: LinterConfig
  /** Schema for schema-aware rules */
  schema?: SchemaType
  /** Force use of TypeScript rules even when WASM is available */
  forceTs?: boolean
}

/**
 * Initialize the WASM linter for better performance
 *
 * Call this once at application startup. The linter will automatically
 * fall back to TypeScript rules if WASM is not available.
 *
 * @returns Promise that resolves to true if WASM is available
 *
 * @example
 * ```typescript
 * import { initLinter, lint } from '@sanity-labs/groq-lint'
 *
 * // Optional: Initialize WASM for better performance
 * await initLinter()
 *
 * // Now lint() will use WASM for pure GROQ rules
 * const result = lint('*[_type == "post"]{ author-> }')
 * ```
 */
export async function initLinter(): Promise<boolean> {
  return initWasmLinter()
}

/**
 * Lint a GROQ query
 *
 * Uses WASM for pure GROQ rules (if available) and TypeScript for schema-aware rules.
 * Call `initLinter()` first to enable WASM support.
 *
 * @param query - The GROQ query string to lint
 * @param options - Optional configuration and schema
 * @returns Lint result with findings
 */
export function lint(query: string, options?: LintOptions): LintResult {
  const { config, schema, forceTs = false } = options ?? {}
  const findings: Finding[] = []

  // Handle empty query
  if (!query.trim()) {
    return { query, findings }
  }

  // Get enabled rules, filtering out schema-requiring rules if no schema provided
  const enabledRules = getEnabledRules(config, schema)

  // Split rules into WASM and TS rules
  const wasmRuleIds = new Set<string>()
  const tsRules: Rule[] = []

  for (const rule of enabledRules) {
    if (!forceTs && isWasmAvailable() && isWasmRule(rule.id)) {
      wasmRuleIds.add(rule.id)
    } else {
      tsRules.push(rule)
    }
  }

  // Run WASM rules first (if available)
  const wasmFindings: Finding[] = []
  if (wasmRuleIds.size > 0 && isWasmAvailable()) {
    try {
      const wf = lintWithWasm(query, wasmRuleIds)
      wasmFindings.push(...wf)
    } catch {
      // WASM failed - fall back to TS rules
      for (const ruleId of wasmRuleIds) {
        const rule = enabledRules.find((r) => r.id === ruleId)
        if (rule) {
          tsRules.push(rule)
        }
      }
      wasmRuleIds.clear()
    }
  }

  // Parse the query for TS rules (only if we have TS rules to run)
  let ast
  if (tsRules.length > 0) {
    try {
      ast = parse(query)
    } catch (error) {
      return {
        query,
        findings: wasmFindings, // Return any WASM findings we got
        parseError: error instanceof Error ? error.message : 'Unknown parse error',
      }
    }
  }

  // Track which rules have fired (for supersedes logic)
  const firedRules = new Set<string>()

  // Mark WASM rules that found issues
  for (const f of wasmFindings) {
    firedRules.add(f.ruleId)
  }

  // Run TS rules
  const tsFindings: Finding[] = []
  if (ast) {
    for (const rule of tsRules) {
      const ruleFindings: Finding[] = []

      const context: RuleContext = {
        query,
        queryLength: query.length,
        ...(schema && { schema }),
        report: (finding) => {
          ruleFindings.push({
            ...finding,
            ruleId: rule.id,
            severity: finding.severity ?? rule.severity,
          })
        },
      }

      rule.check(ast, context)

      if (ruleFindings.length > 0) {
        firedRules.add(rule.id)
        tsFindings.push(...ruleFindings)
      }
    }
  }

  // Combine all findings
  const allFindings = [...wasmFindings, ...tsFindings]

  // Apply supersedes logic
  for (const finding of allFindings) {
    const rule = enabledRules.find((r) => r.id === finding.ruleId)
    if (rule?.supersedes) {
      // Check if any superseding rule has fired
      const isSuperseded = enabledRules.some(
        (r) => r.supersedes?.includes(finding.ruleId) && firedRules.has(r.id)
      )
      if (!isSuperseded) {
        findings.push(finding)
      }
    } else {
      findings.push(finding)
    }
  }

  return { query, findings }
}

/**
 * Get enabled rules based on configuration
 */
function getEnabledRules(config?: LinterConfig, schema?: SchemaType): Rule[] {
  let rules = allRules

  // Filter out schema-requiring rules if no schema is provided
  if (!schema) {
    rules = rules.filter((rule) => !rule.requiresSchema)
  }

  if (!config?.rules) {
    return rules
  }

  return rules.filter((rule) => {
    const ruleConfig = config.rules?.[rule.id]
    if (ruleConfig === false) {
      return false
    }
    if (typeof ruleConfig === 'object' && ruleConfig.enabled === false) {
      return false
    }
    return true
  })
}

/**
 * Lint multiple queries
 *
 * @param queries - Array of queries to lint
 * @param options - Optional configuration and schema
 * @returns Array of lint results
 */
export function lintMany(queries: string[], options?: LintOptions): LintResult[] {
  return queries.map((query) => lint(query, options))
}
