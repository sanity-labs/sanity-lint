/**
 * Embedded GROQ support for JavaScript/TypeScript files.
 *
 * This module provides an estree printer with an embed function that formats
 * GROQ queries inside:
 * - Tagged template literals: groq`...`, defineQuery`...`
 * - Function calls: defineQuery("...")
 *
 * Usage in .prettierrc:
 * ```json
 * {
 *   "plugins": ["prettier-plugin-groq", "prettier-plugin-groq/embed"]
 * }
 * ```
 */

import { doc } from 'prettier'
import type { AstPath, Doc, Options, Plugin, Printer } from 'prettier'
import { printers as estreePrinters } from 'prettier/plugins/estree'
import { parsers } from './index.js'

// Get the default estree printer to wrap
const defaultEstreePrinter = estreePrinters.estree
const defaultEmbed = defaultEstreePrinter.embed

// Tags and function names that indicate GROQ content
const GROQ_IDENTIFIERS = new Set(['groq', 'defineQuery'])

const PLACEHOLDER_PREFIX = '$__expr'
const PLACEHOLDER_SUFFIX = '__'
const PLACEHOLDER_PATTERN = /\$__expr(\d+)__/g

function placeholder(index: number): string {
  return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`
}

/**
 * Replace the placeholders that stand in for `${expr}` interpolations with the
 * printed JavaScript expressions, so the template literal round-trips exactly.
 *
 * Returns `undefined` when the formatted GROQ does not contain every
 * placeholder exactly once; callers should then leave the code untouched
 * instead of emitting a corrupted template.
 */
function restoreExpressions(
  formatted: Doc,
  expressionCount: number,
  printExpression: (index: number) => Doc,
  options: Options
): Doc | undefined {
  const seen = new Array<number>(expressionCount).fill(0)
  let unknownPlaceholder = false

  const restored = doc.utils.mapDoc(formatted, (part) => {
    if (typeof part !== 'string' || !part.includes(PLACEHOLDER_PREFIX)) {
      return part
    }

    const pieces: Array<Doc> = []
    let last = 0
    for (const match of part.matchAll(PLACEHOLDER_PATTERN)) {
      const index = Number(match[1])
      if (index >= expressionCount) {
        unknownPlaceholder = true
        continue
      }
      seen[index] = (seen[index] ?? 0) + 1
      pieces.push(part.slice(last, match.index))
      // Print on a single line so the interpolation is never reflowed
      const printed = doc.printer.printDocToString(printExpression(index), {
        printWidth: Number.POSITIVE_INFINITY,
        tabWidth: options.tabWidth ?? 2,
        useTabs: options.useTabs ?? false,
      }).formatted
      pieces.push('${' + printed + '}')
      last = match.index + match[0].length
    }
    if (pieces.length === 0) {
      return part
    }
    pieces.push(part.slice(last))
    return pieces
  })

  if (unknownPlaceholder || seen.some((count) => count !== 1)) {
    return undefined
  }
  return restored
}

/**
 * Get the tag name from a TaggedTemplateExpression
 */
function getTagName(node: EstreeLikeNode): string | null {
  if (node.type !== 'TaggedTemplateExpression') {
    return null
  }

  const tag = node.tag
  if (!tag) {
    return null
  }

  // groq`...`
  if (tag.type === 'Identifier' && typeof tag.name === 'string') {
    return tag.name
  }

  // groq.experimental`...` - get the object name
  if (tag.type === 'MemberExpression' && tag.object?.type === 'Identifier') {
    return tag.object.name ?? null
  }

  return null
}

/**
 * Get the function name from a CallExpression
 */
function getCallName(node: EstreeLikeNode): string | null {
  if (node.type !== 'CallExpression') {
    return null
  }

  const callee = node.callee
  if (!callee) {
    return null
  }

  // defineQuery("...")
  if (callee.type === 'Identifier' && typeof callee.name === 'string') {
    return callee.name
  }

  return null
}

/**
 * Check if a node is a GROQ tagged template literal
 */
function isGroqTaggedTemplate(node: EstreeLikeNode): boolean {
  const tagName = getTagName(node)
  return tagName !== null && GROQ_IDENTIFIERS.has(tagName)
}

/**
 * Check if a node is a GROQ function call like defineQuery("...")
 */
function isGroqFunctionCall(node: EstreeLikeNode): boolean {
  const callName = getCallName(node)
  return callName !== null && GROQ_IDENTIFIERS.has(callName)
}

/**
 * Extract GROQ content from a tagged template literal
 */
function extractFromTemplate(node: EstreeLikeNode): string | null {
  const quasi = node.quasi
  if (!quasi || !quasi.quasis) {
    return null
  }

  const quasis = quasi.quasis
  const expressions = quasi.expressions || []

  // Simple case: no expressions
  if (expressions.length === 0) {
    const first = quasis[0]
    if (!first) {
      return null
    }
    return first.value?.cooked ?? first.value?.raw ?? null
  }

  // Build string with placeholders for expressions
  let result = ''
  for (let i = 0; i < quasis.length; i++) {
    const q = quasis[i]
    if (!q) {
      continue
    }
    result += q.value?.cooked ?? q.value?.raw ?? ''
    if (i < expressions.length) {
      // Use a GROQ parameter placeholder that will parse correctly
      result += placeholder(i)
    }
  }

  return result
}

/**
 * Extract GROQ content from a function call like defineQuery("...")
 */
function extractFromFunctionCall(node: EstreeLikeNode): string | null {
  const args = node.arguments
  if (!args || args.length === 0) {
    return null
  }

  const firstArg = args[0]
  if (!firstArg) {
    return null
  }

  // String literal: defineQuery("*[_type == 'post']")
  // Handle both ESTree (Literal) and Babel (StringLiteral) AST types
  if (
    (firstArg.type === 'Literal' || firstArg.type === 'StringLiteral') &&
    typeof firstArg.value === 'string'
  ) {
    return firstArg.value
  }

  // Template literal: defineQuery(`*[_type == 'post']`)
  if (firstArg.type === 'TemplateLiteral') {
    const quasis = firstArg.quasis
    const expressions = firstArg.expressions || []

    if (!quasis || quasis.length === 0) {
      return null
    }

    if (expressions.length === 0) {
      const first = quasis[0]
      return first?.value?.cooked ?? first?.value?.raw ?? null
    }

    // Build string with placeholders
    let result = ''
    for (let i = 0; i < quasis.length; i++) {
      const q = quasis[i]
      if (!q) {
        continue
      }
      result += q.value?.cooked ?? q.value?.raw ?? ''
      if (i < expressions.length) {
        result += placeholder(i)
      }
    }
    return result
  }

  return null
}

// Minimal type for AST nodes we care about
interface EstreeLikeNode {
  type: string
  tag?: EstreeLikeNode
  callee?: EstreeLikeNode
  object?: EstreeLikeNode
  name?: string
  quasi?: {
    quasis?: Array<{
      value?: { cooked?: string | null; raw?: string }
    }>
    expressions?: Array<unknown>
  }
  arguments?: Array<{
    type: string
    value?: unknown
    quasis?: Array<{
      value?: { cooked?: string | null; raw?: string }
    }>
    expressions?: Array<unknown>
  }>
}

function defaultEmbedFor(path: AstPath<EstreeLikeNode>, options: Options): EmbedFn | null {
  const embedder = defaultEmbed?.(path, options)
  return typeof embedder === 'function' ? embedder : null
}

type EmbedFn = (
  textToDoc: (text: string, options: Options) => Promise<Doc>,
  print: (selector?: string | number | Array<string | number> | AstPath) => Doc,
  path: AstPath,
  options: Options
) => Promise<Doc | undefined> | Doc | undefined

/**
 * The embed function for estree that handles GROQ
 */
function embed(path: AstPath<EstreeLikeNode>, options: Options): EmbedFn | null {
  const node = path.node

  // Handle tagged template literals: groq`...`
  if (isGroqTaggedTemplate(node)) {
    const content = extractFromTemplate(node)
    if (!content) {
      // Fall back to default embed behavior
      return defaultEmbedFor(path, options)
    }

    return async (textToDoc, print): Promise<Doc | undefined> => {
      try {
        // Format the GROQ content
        const formattedGroq = await textToDoc(content.trim(), { parser: 'groq' })

        const restored = restoreExpressions(
          formattedGroq,
          node.quasi?.expressions?.length ?? 0,
          (index) => print(['quasi', 'expressions', index]),
          options
        )
        if (!restored) {
          return undefined
        }

        // Get the tag printed normally
        const tag = print('tag')

        // Return the tag followed by formatted template literal
        return [tag, '`', restored, '`']
      } catch {
        // If GROQ formatting fails, return undefined to use default printing
        return undefined
      }
    }
  }

  // Handle function calls: defineQuery("...")
  if (isGroqFunctionCall(node)) {
    const content = extractFromFunctionCall(node)
    if (!content) {
      // Fall back to default embed behavior
      return defaultEmbedFor(path, options)
    }

    return async (textToDoc, print): Promise<Doc | undefined> => {
      try {
        // Format the GROQ content
        const formattedGroq = await textToDoc(content.trim(), { parser: 'groq' })

        const restored = restoreExpressions(
          formattedGroq,
          node.arguments?.[0]?.expressions?.length ?? 0,
          (index) => print(['arguments', 0, 'expressions', index]),
          options
        )
        if (!restored) {
          return undefined
        }

        // Get the function name printed normally
        const callee = print('callee')

        // Return the function call with formatted GROQ
        return [callee, '(`', restored, '`)']
      } catch {
        // If GROQ formatting fails, return undefined to use default printing
        return undefined
      }
    }
  }

  // Fall back to default embed behavior for all other nodes
  return defaultEmbedFor(path, options)
}

/**
 * The estree printer that wraps the default estree printer with GROQ embed support
 */
const estreePrinter: Printer = {
  ...defaultEstreePrinter,
  embed,
}

/**
 * The embed plugin exports an estree printer with embed support.
 * Load this alongside the main prettier-plugin-groq for embedded GROQ in JS/TS.
 */
const embedPlugin: Plugin = {
  parsers,
  printers: {
    estree: estreePrinter,
  },
}

export default embedPlugin
export { embed, parsers }
