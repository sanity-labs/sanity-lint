import type { Rule } from '@sanity-labs/lint-core'
import { walk } from '../walker'

/**
 * Rule: join-to-get-id
 *
 * Detects using a dereference operator (->) to retrieve the _id of a document.
 * This is inefficient because `ref->_id` can be written as `ref._ref`.
 */
export const joinToGetId: Rule = {
  id: 'join-to-get-id',
  name: 'Join to Get ID',
  description: 'Avoid using `->` to retrieve `_id`.',
  severity: 'info',
  category: 'performance',

  check(ast, context) {
    walk(ast, (node) => {
      // Look for AccessAttribute with name "_id" whose base is a Deref
      if (node.type === 'AccessAttribute' && node.name === '_id') {
        if (node.base && node.base.type === 'Deref') {
          context.report({
            message: 'Avoid using `->` to retrieve `_id`. Use `._ref` instead.',
            severity: 'info',
            help: 'Replace `reference->_id` with `reference._ref` for better performance.',
          })
        }
      }
    })
  },
}
