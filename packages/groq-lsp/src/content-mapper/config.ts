/**
 * groq-content-mapper's configuration, read from the `contentMappers` entry of the
 * `tsconfig.json` nearest a file, the way the mapper's loaders read it.
 *
 * ```jsonc
 * {
 *   "contentMappers": [
 *     {
 *       "package": "@sanity-labs/groq-content-mapper",
 *       "extensions": [".groq"],
 *       "options": {"schema": "./schema.json", "functions": ["groq/*.groq"]}
 *     }
 *   ]
 * }
 * ```
 */

import { statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { getTsconfig, parseTsconfig } from 'get-tsconfig'
import type { Cache } from 'get-tsconfig'
import { loadGroqFunctions } from './functions.js'
import type { LoadedGroqFunctions } from './functions.js'
import { compileInclude } from './include.js'
import type { Include } from './include.js'

export const CONTENT_MAPPER_PACKAGE = '@sanity-labs/groq-content-mapper'

/** The mapper's configuration for the files a `tsconfig.json` covers. */
export interface ContentMapperConfig {
  /** The `tsconfig.json`, absolute. Relative option paths resolve against its directory. */
  configPath: string
  /** The file extensions the mapper handles, such as `.groq`. */
  extensions: Array<string>
  /** The custom functions of the `functions` option, when it is set. */
  functions?: LoadedGroqFunctions
  /** Problems with the options or the functions files. */
  issues: Array<string>
  /** The schema files the options name, absolute. */
  schemaPaths: Array<string>
  /**
   * The schema for `file`: that of the `schemas` entry whose deepest folder contains it, else
   * `schema`, else none.
   */
  schemaFor(file: string): string | undefined
  /** Whether `file` has one of the mapper's extensions, so its queries get the functions. */
  handles(file: string): boolean
}

interface Scope {
  includes: Array<Include>
  schema: string
}

interface Loaded {
  config: ContentMapperConfig | undefined
  /** The modification time of each file the config was read from. */
  stamps: Map<string, number | undefined>
}

/** The parts of a parsed `tsconfig.json` the mapper reads, before they are checked. */
interface TsconfigInput {
  contentMappers?: unknown
}

interface MapperEntryInput {
  package?: unknown
  extensions?: unknown
  options?: unknown
}

interface MapperOptionsInput {
  schema?: unknown
  schemas?: unknown
  functions?: unknown
}

interface SchemaScopeInput {
  include?: unknown
  schema?: unknown
}

const isObject = <Input extends object>(value: unknown): value is Input =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPath = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const isPathList = (value: unknown): value is string | Array<string> =>
  isPath(value) || (Array.isArray(value) && value.length > 0 && value.every(isPath))

const list = (value: string | Array<string>) => (Array.isArray(value) ? value : [value])

function mtimeOf(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs
  } catch {
    return undefined
  }
}

/** Reads the mapper's entry from a parsed tsconfig, or `undefined` when it has none. */
export function readContentMapperConfig(
  configPath: string,
  tsconfig: unknown
): ContentMapperConfig | undefined {
  const contentMappers = isObject<TsconfigInput>(tsconfig) ? tsconfig.contentMappers : undefined
  if (!Array.isArray(contentMappers)) {
    return undefined
  }
  const entry: unknown = contentMappers.find(
    (each) => isObject<MapperEntryInput>(each) && each.package === CONTENT_MAPPER_PACKAGE
  )
  if (!isObject<MapperEntryInput>(entry)) {
    return undefined
  }

  const root = dirname(configPath)
  const issues: Array<string> = []
  const report = (problem: string) => issues.push(`${configPath}: ${problem}`)
  const declaredExtensions = entry.extensions
  const extensions =
    Array.isArray(declaredExtensions) && declaredExtensions.every(isPath)
      ? declaredExtensions
      : ['.groq']

  const options = entry.options ?? {}
  const known = isObject<MapperOptionsInput>(options)
  if (!known) {
    report('The content mapper options must be an object.')
  }
  const { schema, schemas, functions }: MapperOptionsInput = known ? options : {}

  let fallback: string | undefined
  if (schema !== undefined) {
    if (isPath(schema)) {
      fallback = resolve(root, schema)
    } else {
      report('"schema" must be the path of a schema file.')
    }
  }

  const scopes: Array<Scope> = []
  if (schemas !== undefined) {
    if (!Array.isArray(schemas)) {
      report('"schemas" must be a list of {include, schema} entries.')
    }
    for (const [index, item] of (Array.isArray(schemas) ? schemas : []).entries()) {
      const { include, schema: itemSchema }: SchemaScopeInput = isObject<SchemaScopeInput>(item)
        ? item
        : {}
      if (isPathList(include) && isPath(itemSchema)) {
        scopes.push({
          includes: list(include).map((each) => compileInclude(each, root)),
          schema: resolve(root, itemSchema),
        })
      } else {
        report(`"schemas" entry ${index} must have an "include" folder or glob and a "schema".`)
      }
    }
  }

  let loadedFunctions: LoadedGroqFunctions | undefined
  if (functions !== undefined) {
    if (isPathList(functions)) {
      loadedFunctions = loadGroqFunctions(functions, root)
      issues.push(...loadedFunctions.issues)
    } else {
      report('"functions" must be a file, a glob, or a list of them.')
    }
  }

  const config: ContentMapperConfig = {
    configPath,
    extensions,
    issues,
    schemaPaths: [...new Set([...(fallback ? [fallback] : []), ...scopes.map((s) => s.schema)])],
    schemaFor(file) {
      let best: string | undefined
      let depth = -1
      for (const scope of scopes) {
        for (const include of scope.includes) {
          const found = include.depthOf(file)
          if (found > depth) {
            best = scope.schema
            depth = found
          }
        }
      }
      return best ?? fallback
    },
    handles: (file) => extensions.includes(extname(file)),
  }
  if (loadedFunctions) {
    config.functions = loadedFunctions
  }
  return config
}

/**
 * Finds and caches the mapper's configuration per file. A config is read again when its
 * `tsconfig.json` or one of its functions files changes on disk; `invalidate` forgets which
 * `tsconfig.json` is nearest each folder, for when one is created or deleted.
 */
export class ContentMapperConfigs {
  private nearest = new Map<string, string | null>()
  private lookupCache: Cache<unknown> = new Map()
  private loaded = new Map<string, Loaded>()

  /** The mapper's configuration for `file`, absolute, or `undefined` when it has none. */
  forFile(file: string): ContentMapperConfig | undefined {
    const folder = dirname(file)
    let configPath = this.nearest.get(folder)
    if (configPath === undefined) {
      const found = getTsconfig(folder, 'tsconfig.json', this.lookupCache)
      configPath = found ? resolve(found.path) : null
      this.nearest.set(folder, configPath)
    }
    if (!configPath) {
      return undefined
    }

    const cached = this.loaded.get(configPath)
    if (cached && [...cached.stamps].every(([path, stamp]) => mtimeOf(path) === stamp)) {
      return cached.config
    }

    let config: ContentMapperConfig | undefined
    try {
      config = readContentMapperConfig(configPath, parseTsconfig(configPath))
    } catch {
      config = undefined
    }
    const stamps = new Map<string, number | undefined>()
    for (const path of [configPath, ...(config?.functions?.files ?? [])]) {
      stamps.set(path, mtimeOf(path))
    }
    this.loaded.set(configPath, { config, stamps })
    return config
  }

  /** Every config read so far. */
  all(): Array<ContentMapperConfig> {
    return [...this.loaded.values()].flatMap(({ config }) => (config ? [config] : []))
  }

  invalidate(): void {
    this.nearest.clear()
    this.lookupCache.clear()
    this.loaded.clear()
  }
}
