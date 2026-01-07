import type { TSESTree } from '@typescript-eslint/types'

/**
 * Known function names that take GROQ queries as their first argument.
 * Used by next-sanity and other Sanity packages.
 */
const GROQ_FUNCTION_NAMES = ['defineQuery', 'groq']

/**
 * Check if a node is a tagged template literal with a GROQ tag.
 * Matches: groq`...`, groq.something`...`
 */
export function isGroqTaggedTemplate(node: TSESTree.TaggedTemplateExpression): boolean {
  const tag = node.tag

  // groq`...`
  if (tag.type === 'Identifier' && tag.name === 'groq') {
    return true
  }

  // groq.something`...` (for groq.experimental etc)
  if (
    tag.type === 'MemberExpression' &&
    tag.object.type === 'Identifier' &&
    tag.object.name === 'groq'
  ) {
    return true
  }

  return false
}

/**
 * Check if a node is a function call that takes a GROQ query as its first argument.
 * Matches: defineQuery(`...`), defineQuery("...")
 */
export function isGroqFunctionCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee

  // defineQuery(...) or groq(...)
  if (callee.type === 'Identifier' && GROQ_FUNCTION_NAMES.includes(callee.name)) {
    return true
  }

  return false
}

/**
 * Extract the GROQ query string from a function call.
 * Handles both template literals and string literals as the first argument.
 */
export function extractGroqStringFromCall(node: TSESTree.CallExpression): string | null {
  const firstArg = node.arguments[0]
  if (!firstArg) return null

  // defineQuery(`...`) - template literal
  if (firstArg.type === 'TemplateLiteral') {
    return extractStringFromTemplateLiteral(firstArg)
  }

  // defineQuery("...") - string literal
  if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
    return firstArg.value
  }

  return null
}

/**
 * Extract string from a template literal, handling expressions.
 */
function extractStringFromTemplateLiteral(node: TSESTree.TemplateLiteral): string {
  const { quasis, expressions } = node

  // Simple case: no expressions
  if (expressions.length === 0) {
    return quasis[0]?.value.cooked ?? quasis[0]?.value.raw ?? ''
  }

  // Build the string with placeholders for expressions
  let result = ''
  for (let i = 0; i < quasis.length; i++) {
    result += quasis[i]?.value.cooked ?? quasis[i]?.value.raw ?? ''
    if (i < expressions.length) {
      // Replace expression with a parameter placeholder
      result += `$__expr${i}__`
    }
  }

  return result
}

/**
 * Get the source location for a function call's first argument.
 */
export function getCallArgumentLocation(
  node: TSESTree.CallExpression
): TSESTree.SourceLocation | null {
  const firstArg = node.arguments[0]
  if (!firstArg) return null
  return firstArg.loc
}

/**
 * Extract the GROQ query string from a tagged template literal.
 * Handles template literals with expressions by replacing them with placeholders.
 */
export function extractGroqString(node: TSESTree.TaggedTemplateExpression): string {
  const { quasis, expressions } = node.quasi

  // Simple case: no expressions
  if (expressions.length === 0) {
    return quasis[0]?.value.cooked ?? quasis[0]?.value.raw ?? ''
  }

  // Build the string with placeholders for expressions
  let result = ''
  for (let i = 0; i < quasis.length; i++) {
    result += quasis[i]?.value.cooked ?? quasis[i]?.value.raw ?? ''
    if (i < expressions.length) {
      // Replace expression with a parameter placeholder
      // This allows the query to still parse while marking where expressions are
      result += `$__expr${i}__`
    }
  }

  return result
}

/**
 * Get the source location for reporting errors.
 * Returns the location of the template literal content, not the tag.
 */
export function getTemplateLocation(
  node: TSESTree.TaggedTemplateExpression
): TSESTree.SourceLocation {
  return node.quasi.loc
}
