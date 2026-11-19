/**
 * Custom GROQ functions from groq-content-mapper's `functions` option.
 *
 * Mirrors the mapper's loaders: a query that calls a shared function gets its definition
 * prepended, after the definitions of the functions it calls in turn, each once. A function the
 * query defines itself, or never calls, is left out.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse } from 'groq-js'
import picomatch from 'picomatch'
import { parseCalls, parseDefinitions } from './groq-scanner.js'

/** One `fn namespace::name($param) = …;` definition from a functions file. */
export interface GroqFunction {
  /** `namespace::name`. */
  name: string
  /** The namespaced functions its body calls. */
  calls: Array<string>
  file: string
  /** The definition as written, through its `;`. */
  source: string
}

/** The definitions of a `functions` option by name, the files it matched, and what went wrong. */
export interface LoadedGroqFunctions {
  /** Every file the option names or matched, absolute. */
  files: Array<string>
  functions: Map<string, GroqFunction>
  issues: Array<string>
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Reads the files `option` names, as paths or globs relative to `root`. A missing file, a glob
 * that matches nothing, a definition groq-js rejects and a name defined twice are issues; every
 * valid definition is kept.
 */
export function loadGroqFunctions(
  option: string | Array<string>,
  root: string
): LoadedGroqFunctions {
  const files: Array<string> = []
  const issues: Array<string> = []
  const definitions: Array<GroqFunction> = []
  const invalid = new Set<string>()

  for (const pattern of Array.isArray(option) ? option : [option]) {
    const expanded = expand(pattern, root)
    if ('error' in expanded) {
      issues.push(expanded.error)
      if (expanded.missing) {
        files.push(expanded.missing)
      }
      continue
    }
    for (const file of expanded.files) {
      if (files.includes(file)) {
        continue
      }
      files.push(file)
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch (error) {
        issues.push(`Could not read the functions file ${file}: ${message(error)}`)
        continue
      }
      const parsed = parseDefinitions(text)
      for (const { name, calls, start, end } of parsed.definitions) {
        definitions.push({ name, calls, file, source: text.slice(start, end) })
      }
      for (const problem of parsed.problems) {
        if (problem.name) {
          invalid.add(problem.name)
        }
        issues.push(`Invalid function definition in ${file}: ${problem.message}.`)
      }
    }
  }

  const functions = new Map<string, GroqFunction>()
  for (const fn of definitions) {
    const existing = functions.get(fn.name)
    if (existing) {
      issues.push(
        `The function ${fn.name} is defined twice: in ${existing.file} and in ${fn.file}.`
      )
      continue
    }
    functions.set(fn.name, fn)
  }

  // groq-js checks what the scanner does not: bodies must be projections, calls must resolve.
  const dependsOnInvalid = (fn: GroqFunction) =>
    fn.calls.some((call) => invalid.has(call)) ||
    dependencies(fn, functions).some((dependency) => invalid.has(dependency.name))
  for (const fn of functions.values()) {
    if (dependsOnInvalid(fn)) {
      continue
    }
    try {
      parse(`${[...dependencies(fn, functions), fn].map((each) => each.source).join('\n')}\nnull`)
    } catch (error) {
      invalid.add(fn.name)
      issues.push(`Invalid function definition ${fn.name} in ${fn.file}: ${message(error)}`)
    }
  }
  const unusable = new Set(invalid)
  for (const fn of functions.values()) {
    if (dependsOnInvalid(fn)) {
      unusable.add(fn.name)
    }
  }
  for (const name of unusable) {
    functions.delete(name)
  }

  return { files, functions, issues }
}

/**
 * The definitions `query` needs prepended: those of the custom functions it calls, and of the
 * functions they call in turn, each once and after what it calls, joined with newlines. Empty
 * when it needs none.
 */
export function groqFunctionsPrelude(query: string, functions: Map<string, GroqFunction>): string {
  if (functions.size === 0) {
    return ''
  }
  const { calls, defines } = parseCalls(query)
  return called(calls, functions, new Set(defines))
    .map((fn) => fn.source)
    .join('\n')
}

/**
 * {@link groqFunctionsPrelude} with every body left out, so linting `query` after it finds only
 * what is in `query` itself.
 */
export function groqFunctionStubsPrelude(
  query: string,
  functions: Map<string, GroqFunction>
): string {
  if (functions.size === 0) {
    return ''
  }
  const { calls, defines } = parseCalls(query)
  return called(calls, functions, new Set(defines))
    .map((fn) => groqFunctionStub(fn.source))
    .join('\n')
}

/**
 * `fn namespace::name($param) = $param{};`: the definition in `source` with its body left out.
 * groq-js allows a single parameter, and an empty projection of it is the smallest valid body.
 */
export function groqFunctionStub(source: string): string {
  const header = /^fn\s+\w+::\w+\s*\(\s*(\$\w+)\s*\)/.exec(source)
  return header ? `${header[0]} = ${header[1]}{};` : source
}

/** `query` with the custom functions it calls prepended, as groq-content-mapper's loaders do. */
export function withGroqFunctions(query: string, functions: Map<string, GroqFunction>): string {
  const prelude = groqFunctionsPrelude(query, functions)
  return prelude ? `${prelude}\n${query}` : query
}

function dependencies(fn: GroqFunction, functions: Map<string, GroqFunction>): Array<GroqFunction> {
  return called(fn.calls, functions, new Set([fn.name]))
}

function called(
  calls: Array<string>,
  functions: Map<string, GroqFunction>,
  skip: Set<string>
): Array<GroqFunction> {
  const found: Array<GroqFunction> = []
  const visit = (name: string) => {
    const fn = functions.get(name)
    if (!fn || skip.has(name)) {
      return
    }
    skip.add(name)
    for (const call of fn.calls) {
      visit(call)
    }
    found.push(fn)
  }
  for (const call of calls) {
    visit(call)
  }
  return found
}

function scan(pattern: string) {
  return picomatch.scan(process.platform === 'win32' ? pattern.replaceAll('\\', '/') : pattern)
}

function expand(
  pattern: string,
  root: string
): { files: Array<string> } | { error: string; missing?: string } {
  const located = isAbsolute(pattern) ? resolve(pattern) : resolve(root, pattern)
  const scanned = scan(pattern)
  if (!scanned.isGlob) {
    if (!existsSync(located)) {
      return { error: `No functions file at ${located}.`, missing: located }
    }
    if (!statSync(located).isFile()) {
      return {
        error: `${located} is a folder. Name the functions files, or match them with a glob.`,
      }
    }
    return { files: [located] }
  }
  const base = resolve(root, scanned.base || '.')
  const matches = picomatch(scanned.glob)
  const files = walk(base).filter((file) => matches(relative(base, file).split(sep).join('/')))
  if (files.length === 0) {
    return { error: `"${pattern}" matches no functions files.` }
  }
  return { files }
}

/** Every file under `folder`, sorted, skipping `node_modules` and hidden folders. */
function walk(folder: string): Array<string> {
  let entries
  try {
    entries = readdirSync(folder, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) {
        return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walk(path)
      }
      return entry.isFile() ? [path] : []
    })
    .sort()
}
