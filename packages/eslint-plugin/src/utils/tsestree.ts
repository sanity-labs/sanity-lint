import type { Rule } from 'eslint'
import type { TSESTree } from '@typescript-eslint/types'

/**
 * View an ESLint rule node as its `@typescript-eslint` counterpart.
 *
 * ESLint's ESTree types and TSESTree describe the same runtime objects, but
 * TypeScript treats them as unrelated, so the bridge needs a double assertion.
 */
export function asTSESTree<T extends TSESTree.Node>(node: Rule.Node): T {
  // oxlint-disable-next-line quality/no-chained-type-assertions -- ESTree and TSESTree types do not overlap
  return node as unknown as T
}
