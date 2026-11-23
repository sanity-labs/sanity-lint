import path from 'node:path'
import type { FragmentHost } from './types.js'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
// TypeScript lets `./a.js` stand for `./a.ts`.
const EMITTED_EXTENSIONS = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
])

export interface PathMapping {
  /** Directory the targets are relative to. */
  base: string
  /** Whether `base` comes from an explicit `baseUrl`, so bare specifiers may resolve from it. */
  hasBaseUrl: boolean
  paths: Record<string, Array<string>>
}

/** The path mapping a parsed tsconfig.json declares in its `compilerOptions`, if any. */
function toPathMapping(config: unknown, dir: string): PathMapping | undefined {
  if (typeof config !== 'object' || config === null || !('compilerOptions' in config)) {
    return undefined
  }
  const options = config.compilerOptions
  if (typeof options !== 'object' || options === null) {
    return undefined
  }
  const baseUrl =
    'baseUrl' in options && typeof options.baseUrl === 'string' && options.baseUrl !== ''
      ? options.baseUrl
      : undefined
  if ('paths' in options && typeof options.paths === 'object' && options.paths !== null) {
    const targets: Array<[string, Array<string>]> = []
    for (const [pattern, value] of Object.entries(options.paths)) {
      const list: unknown = value
      if (Array.isArray(list)) {
        targets.push([pattern, list.filter((target) => typeof target === 'string')])
      }
    }
    return {
      base: path.resolve(dir, baseUrl ?? '.'),
      hasBaseUrl: baseUrl !== undefined,
      paths: Object.fromEntries(targets),
    }
  }
  return baseUrl === undefined
    ? undefined
    : { base: path.resolve(dir, baseUrl), hasBaseUrl: true, paths: {} }
}

/** Removes comments and trailing commas so a tsconfig.json parses as JSON. */
function stripJsonc(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (char === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1
      }
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i)
      i = newline === -1 ? text.length : newline
    } else if (char === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 ? text.length : close + 2
    } else {
      out += char
      i++
    }
  }
  return out.replaceAll(/,(\s*[}\]])/g, '$1')
}

export async function readPathMapping(
  fromFile: string,
  host: FragmentHost
): Promise<PathMapping | undefined> {
  let dir = path.dirname(fromFile)
  for (;;) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const text = await host.readFile(path.join(dir, name))
      if (text === undefined) {
        continue
      }
      try {
        return toPathMapping(JSON.parse(stripJsonc(text)), dir)
      } catch {
        // A tsconfig that does not parse maps nothing.
        return undefined
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/** The text a `*` in the pattern stands for, '' for a pattern without one, undefined if no match. */
function matchPattern(pattern: string, specifier: string): string | undefined {
  const star = pattern.indexOf('*')
  if (star === -1) {
    return specifier === pattern ? '' : undefined
  }
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (specifier.length < prefix.length + suffix.length) {
    return undefined
  }
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return undefined
  }
  return specifier.slice(prefix.length, specifier.length - suffix.length)
}

/** Where the `paths` of the mapping send the specifier, the most specific pattern first like TypeScript. */
export function pathCandidates(specifier: string, mapping: PathMapping): Array<string> {
  const matches: Array<{ prefixLength: number; targets: Array<string>; matched: string }> = []
  for (const [pattern, targets] of Object.entries(mapping.paths)) {
    const matched = matchPattern(pattern, specifier)
    if (matched === undefined || !Array.isArray(targets)) {
      continue
    }
    matches.push({
      prefixLength: pattern.indexOf('*') === -1 ? pattern.length : pattern.indexOf('*'),
      targets,
      matched,
    })
  }
  matches.sort((a, b) => b.prefixLength - a.prefixLength)
  return matches.flatMap(({ targets, matched }) =>
    targets.map((target) => path.resolve(mapping.base, String(target).replace('*', matched)))
  )
}

function mapThroughPaths(specifier: string, mapping: PathMapping): Array<string> {
  const candidates = pathCandidates(specifier, mapping)
  // `baseUrl` alone also makes `lib/queries` resolve from the base.
  candidates.push(path.resolve(mapping.base, specifier))
  return candidates
}

async function firstReadable(base: string, host: FragmentHost): Promise<string | undefined> {
  const ext = path.extname(base)
  const candidates = [
    base,
    ...(EMITTED_EXTENSIONS.get(ext) ?? []).map(
      (replacement) => base.slice(0, -ext.length) + replacement
    ),
    ...SOURCE_EXTENSIONS.map((extension) => base + extension),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, 'index' + extension)),
  ]
  for (const candidate of candidates) {
    if ((await host.readFile(candidate)) !== undefined) {
      return candidate
    }
  }
  return undefined
}

// Conditions that lead to code rather than type declarations, `source` first as workspace
// packages use it for the files that are edited.
const ENTRY_CONDITIONS = ['source', 'import', 'module', 'default', 'require', 'node']

/** The fields of a package.json that lead to its entry points; none of them is checked yet. */
interface PackageManifest {
  exports?: unknown
  source?: unknown
  module?: unknown
  main?: unknown
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    for (const each of value) {
      const target = exportTarget(each)
      if (target !== undefined) {
        return target
      }
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    const conditions = new Map(Object.entries(value))
    for (const condition of ENTRY_CONDITIONS) {
      const target = exportTarget(conditions.get(condition))
      if (target !== undefined) {
        return target
      }
    }
  }
  return undefined
}

function subpathTarget(exports: unknown, subpath: string): string | undefined {
  const key = subpath ? `./${subpath}` : '.'
  const isSubpathMap =
    exports !== null &&
    typeof exports === 'object' &&
    !Array.isArray(exports) &&
    Object.keys(exports).some((name) => name.startsWith('.'))
  if (!isSubpathMap) {
    return subpath ? undefined : exportTarget(exports)
  }
  const map = new Map(Object.entries(exports))
  if (map.has(key)) {
    return exportTarget(map.get(key))
  }
  for (const [pattern, value] of map) {
    const matched = pattern.includes('*') ? matchPattern(pattern, key) : undefined
    const target = matched === undefined ? undefined : exportTarget(value)
    if (target !== undefined) {
      return target.replace('*', matched ?? '')
    }
  }
  return undefined
}

async function resolvePackageEntry(
  root: string,
  subpath: string,
  manifest: string,
  host: FragmentHost
): Promise<string | undefined> {
  let parsed: unknown
  try {
    parsed = JSON.parse(manifest)
  } catch {
    return undefined
  }
  const pkg: PackageManifest = typeof parsed === 'object' && parsed !== null ? parsed : {}
  let target = pkg.exports === undefined ? undefined : subpathTarget(pkg.exports, subpath)
  if (target === undefined && !subpath) {
    target = [pkg.source, pkg.module, pkg.main].find((field) => typeof field === 'string')
  }
  const candidates = target === undefined ? [] : [path.resolve(root, target)]
  candidates.push(path.join(root, subpath))
  for (const candidate of candidates) {
    const found = await firstReadable(candidate, host)
    if (found) {
      return found
    }
  }
  return undefined
}

/** Finds a package the way Node does, from the node_modules folders above the importing file. */
async function resolvePackage(
  fromFile: string,
  specifier: string,
  host: FragmentHost
): Promise<string | undefined> {
  const parts = specifier.split('/')
  const nameLength = specifier.startsWith('@') ? 2 : 1
  if (parts.length < nameLength || parts.slice(0, nameLength).some((part) => !part)) {
    return undefined
  }
  const name = parts.slice(0, nameLength).join('/')
  const subpath = parts.slice(nameLength).join('/')
  let dir = path.dirname(fromFile)
  for (;;) {
    const packageDir = path.join(dir, 'node_modules', name)
    const manifest = await host.readFile(path.join(packageDir, 'package.json'))
    if (manifest !== undefined) {
      const root = host.realpath
        ? await host.realpath(packageDir).catch(() => packageDir)
        : packageDir
      return resolvePackageEntry(root, subpath, manifest, host)
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/**
 * Finds the file an import specifier points to: relative paths, the `paths` and `baseUrl` of the
 * nearest tsconfig.json or jsconfig.json, and packages in node_modules, such as the packages of a
 * monorepo's workspace.
 */
export async function resolveImport(
  fromFile: string,
  specifier: string,
  host: FragmentHost
): Promise<string | undefined> {
  if (specifier.startsWith('.')) {
    return firstReadable(path.resolve(path.dirname(fromFile), specifier), host)
  }
  if (path.isAbsolute(specifier) || specifier.startsWith('node:')) {
    return undefined
  }

  const mapping = await readPathMapping(fromFile, host)
  for (const candidate of mapping ? mapThroughPaths(specifier, mapping) : []) {
    const found = await firstReadable(candidate, host)
    if (found) {
      return found
    }
  }
  return resolvePackage(fromFile, specifier, host)
}
