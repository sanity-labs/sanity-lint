import type { Finding } from './types'

/**
 * Format findings as a human-readable string
 */
export function formatFindings(query: string, findings: Array<Finding>): string {
  if (findings.length === 0) {
    return ''
  }

  const lines = query.split('\n')
  const output: Array<string> = []

  for (const finding of findings) {
    const severityPrefix = getSeverityPrefix(finding.severity)

    output.push(`${severityPrefix}[${finding.ruleId}]: ${finding.message}`)

    if (finding.span) {
      const { line, column } = finding.span.start
      output.push(`  --> query:${line}:${column}`)

      // Show the offending line with context
      const lineContent = lines[line - 1]
      if (lineContent !== undefined) {
        const lineNum = String(line).padStart(3, ' ')
        output.push(`   |`, `${lineNum} | ${lineContent}`)

        // Add caret pointing to the issue
        const caretPadding = ' '.repeat(column - 1)
        const caretLength = Math.max(
          1,
          finding.span.end.line === line
            ? finding.span.end.column - column
            : lineContent.length - column + 1
        )
        const caret = '^'.repeat(caretLength)
        output.push(`   | ${caretPadding}${caret}`)
      }
      output.push(`   |`)
    }

    if (finding.help) {
      output.push(`  = help: ${finding.help}`)
    }

    output.push('')
  }

  return output.join('\n')
}

/**
 * Format findings as JSON
 */
export function formatFindingsJson(findings: Array<Finding>): string {
  return JSON.stringify(findings, null, 2)
}

/**
 * Get severity prefix for display
 */
function getSeverityPrefix(severity: Finding['severity']): string {
  switch (severity) {
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    case 'info':
      return 'info'
  }
}

/**
 * Summary of findings by severity
 */
export interface FindingsSummary {
  total: number
  errors: number
  warnings: number
  infos: number
}

/**
 * Get a summary of findings
 */
export function summarizeFindings(findings: Array<Finding>): FindingsSummary {
  return {
    total: findings.length,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  }
}
