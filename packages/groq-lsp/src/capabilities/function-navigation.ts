/**
 * Go to definition and find references for custom GROQ functions: those a query defines at its
 * start, and the shared ones of groq-content-mapper's `functions` option.
 */

import { dirname, extname } from 'node:path'
import type { ContentMapperConfig } from '../content-mapper/config.js'
import { type GroqFunction, walk } from '../content-mapper/functions.js'
import {
  findFunctionCalls,
  type FunctionNameSpan,
  leadingDefinitions,
  parseDefinitions,
} from '../content-mapper/groq-scanner.js'
import { extractQueries, findQueryAtOffset } from '../utils/groq-extractor.js'

/** The document a request is about, and how to read the other files it leads to. */
export interface FunctionNavigationContext {
  /** The document's path. */
  file: string
  text: string
  languageId: string
  /** Shared custom functions by `namespace::name`, from groq-content-mapper's settings. */
  functions?: Map<string, GroqFunction> | undefined
  /** A file's text: that of its open document, else what is on disk, else `undefined`. */
  read: (file: string) => string | undefined
  /** The files to look for calls of a shared function in. */
  groqFiles: () => Array<string>
}

/** A span of text in a file, by offsets. */
export interface FileSpan {
  file: string
  start: number
  end: number
}

/** Where a function is defined: the whole definition, and its `namespace::name`. */
export interface FunctionDefinitionTarget extends FileSpan {
  nameStart: number
  nameEnd: number
}

export interface FunctionDefinitionResult {
  /** The `namespace::name` the offset is on, in the document. */
  origin: FileSpan
  target: FunctionDefinitionTarget
}

interface Resolved {
  name: string
  origin: FileSpan
  /** Where the query that defines or calls it starts in the document. */
  queryStart: number
  queryText: string
  /** A definition the query starts with. */
  local?: FunctionDefinitionTarget
  /** The shared definition it is, when the query does not define it itself. */
  shared?: GroqFunction
}

const spanContains = (span: { start: number; end: number }, offset: number) =>
  offset >= span.start && offset <= span.end

function resolve(context: FunctionNavigationContext, offset: number): Resolved | undefined {
  const query = findQueryAtOffset(extractQueries(context.text, context.languageId).queries, offset)
  if (!query) {
    return undefined
  }
  const queryOffset = offset - query.start
  const definitions = leadingDefinitions(query.query)
  const names: Array<FunctionNameSpan> = [
    ...definitions.map(({ name, nameStart, nameEnd }) => ({
      name,
      start: nameStart,
      end: nameEnd,
    })),
    ...findFunctionCalls(query.query),
  ]
  const at = names.find((span) => spanContains(span, queryOffset))
  if (!at) {
    return undefined
  }
  const shared = context.functions?.get(at.name)
  const own = definitions.find((definition) => definition.name === at.name)
  const local = own && {
    file: context.file,
    start: query.start + own.start,
    end: query.start + own.end,
    nameStart: query.start + own.nameStart,
    nameEnd: query.start + own.nameEnd,
  }
  const resolved: Resolved = {
    name: at.name,
    origin: { file: context.file, start: query.start + at.start, end: query.start + at.end },
    queryStart: query.start,
    queryText: query.query,
  }
  if (local) {
    resolved.local = local
  }
  // A query's own definition shadows the shared one, unless this is the functions file.
  if (shared && (!local || shared.file === context.file)) {
    resolved.shared = shared
  }
  return resolved
}

/** Where the shared function is defined, read again so unsaved edits to its file count. */
function sharedTarget(
  fn: GroqFunction,
  context: FunctionNavigationContext
): FunctionDefinitionTarget {
  const text = context.read(fn.file)
  const current = text && parseDefinitions(text).definitions.find((each) => each.name === fn.name)
  if (current) {
    return { file: fn.file, ...current }
  }
  return {
    file: fn.file,
    start: fn.start,
    end: fn.start + fn.source.length,
    nameStart: fn.nameStart,
    nameEnd: fn.nameEnd,
  }
}

/** Where the custom function called or defined at `offset` of the document is defined. */
export function getFunctionDefinition(
  context: FunctionNavigationContext,
  offset: number
): FunctionDefinitionResult | undefined {
  const resolved = resolve(context, offset)
  if (!resolved) {
    return undefined
  }
  const target = resolved.local ?? (resolved.shared && sharedTarget(resolved.shared, context))
  return target && { origin: resolved.origin, target }
}

/**
 * The calls of the custom function called or defined at `offset` of the document, and its
 * definition when `includeDeclaration` is set. A shared function is looked for in every file
 * `groqFiles()` gives, except those that define a function of the same name themselves; a
 * function a query defines, only in that query.
 */
export function getFunctionReferences(
  context: FunctionNavigationContext,
  offset: number,
  includeDeclaration: boolean
): Array<FileSpan> {
  const resolved = resolve(context, offset)
  if (!resolved) {
    return []
  }
  const { name, shared } = resolved
  if (!shared) {
    const calls = findFunctionCalls(resolved.queryText)
      .filter((call) => call.name === name)
      .map((call) => ({
        file: context.file,
        start: resolved.queryStart + call.start,
        end: resolved.queryStart + call.end,
      }))
    const { local } = resolved
    return includeDeclaration && local
      ? [{ file: local.file, start: local.nameStart, end: local.nameEnd }, ...calls]
      : calls
  }

  const references: Array<FileSpan> = []
  const files = [...new Set([shared.file, ...context.groqFiles()])]
  for (const file of files) {
    const text = file === context.file ? context.text : context.read(file)
    if (text === undefined) {
      continue
    }
    const definitions = file === shared.file ? [] : leadingDefinitions(text)
    if (definitions.some((definition) => definition.name === name)) {
      continue
    }
    if (includeDeclaration && file === shared.file) {
      const target = sharedTarget(shared, context)
      references.push({ file, start: target.nameStart, end: target.nameEnd })
    }
    for (const call of findFunctionCalls(text)) {
      if (call.name === name) {
        references.push({ file, start: call.start, end: call.end })
      }
    }
  }
  return references
}

/** The `.groq` files under the folder of the `tsconfig.json`, among those the mapper handles. */
export function contentMapperGroqFiles(config: ContentMapperConfig): Array<string> {
  return walk(dirname(config.configPath)).filter(
    (file) => extname(file) === '.groq' && config.handles(file)
  )
}
