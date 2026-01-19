import type { Rule } from '@sanity-labs/lint-core'

const HUNDRED_KB = 100 * 1024

/**
 * Rule: extremely-large-query
 *
 * Detects queries larger than 100KB which will likely execute very slowly.
 * This rule supersedes very-large-query.
 */
export const extremelyLargeQuery: Rule = {
  id: 'extremely-large-query',
  name: 'Extremely Large Query',
  description: 'This query is extremely large and will likely execute very slowly.',
  severity: 'error',
  category: 'performance',
  supersedes: ['very-large-query'],

  check(_ast, context) {
    if (context.queryLength > HUNDRED_KB) {
      context.report({
        message: `This query is ${formatSize(context.queryLength)}, which is extremely large and will likely execute very slowly. It may be deprioritized by the server.`,
        severity: 'error',
        help: 'Break the query into smaller parts, simplify projections, or reconsider the data model.',
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
