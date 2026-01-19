import type { Rule } from '@sanity-labs/lint-core'

const TEN_KB = 10 * 1024

/**
 * Rule: very-large-query
 *
 * Detects queries larger than 10KB which may execute slowly.
 */
export const veryLargeQuery: Rule = {
  id: 'very-large-query',
  name: 'Very Large Query',
  description: 'This query is very large and may execute slowly.',
  severity: 'warning',
  category: 'performance',

  check(_ast, context) {
    if (context.queryLength > TEN_KB) {
      context.report({
        message: `This query is ${formatSize(context.queryLength)}, which is very large and may execute slowly. It may be deprioritized by the server.`,
        severity: 'warning',
        help: 'Consider breaking the query into smaller parts or simplifying projections.',
      })
    }
  },
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${bytes} bytes`
}
