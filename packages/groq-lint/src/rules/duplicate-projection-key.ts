import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

/**
 * Rule: duplicate-projection-key
 *
 * Detects an object that projects the same key more than once, like `"body": pt::text(body)`
 * and `body`. The last one wins, so the earlier ones are dead code. Spreads (`...`) and
 * conditional spreads (`cond => { ... }`) are not explicit keys and are ignored. Nested objects
 * are checked on their own.
 */
export const duplicateProjectionKey: Rule = {
  id: 'duplicate-projection-key',
  name: 'Duplicate Projection Key',
  description: 'The same key is projected more than once. Only the last one is kept.',
  severity: 'error',
  category: 'correctness',

  check(ast, context) {
    walk(ast, (node) => {
      if (node.type !== 'Object') {
        return
      }

      const keyCounts = new Map<string, number>()
      for (const attr of node.attributes) {
        if (attr.type === 'ObjectAttributeValue') {
          keyCounts.set(attr.name, (keyCounts.get(attr.name) ?? 0) + 1)
        }
      }

      for (const [key, count] of keyCounts) {
        if (count > 1) {
          context.report({
            message: `Key '${key}' is projected ${count} times. Only the last one is kept.`,
            severity: 'error',
            help: `Remove all but one projection of '${key}', or give the others different keys.`,
          })
        }
      }
    })
  },
}
