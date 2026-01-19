import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

const LARGE_PAGE_THRESHOLD = 100

/**
 * Rule: large-pages
 *
 * Detects slice expressions that fetch more than 100 results at once.
 */
export const largePages: Rule = {
  id: 'large-pages',
  name: 'Large Pages',
  description: 'Fetching many results at once can be slow.',
  severity: 'warning',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type === 'Slice') {
        // In groq-js, left/right are direct numbers (or undefined)
        const left = node.left as number | undefined
        const right = node.right as number | undefined

        // Only flag if start is 0 (or not specified) and end > 100
        if ((left === 0 || left === undefined) && typeof right === 'number') {
          if (right > LARGE_PAGE_THRESHOLD) {
            context.report({
              message: `Fetching ${right} results at once can be slow.`,
              severity: 'warning',
              help: 'Consider breaking into smaller batches and/or using cursor-based pagination.',
            })
          }
        }
      }
    })
  },
}
