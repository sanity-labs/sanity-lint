/**
 * Schema loading and caching for schema-aware GROQ linting.
 *
 * Loads schema.json files synchronously and caches them by path
 * to avoid re-reading on every rule invocation.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { SchemaType } from '@sanity-labs/groq-lint'

/**
 * Cache of loaded schemas by absolute path
 */
const schemaCache = new Map<string, SchemaType | null>()

/**
 * Resolve schema path relative to the file being linted.
 *
 * @param schemaPath - Path from settings (relative or absolute)
 * @param filename - Path of file being linted
 * @param cwd - Current working directory
 * @returns Absolute path to schema file
 */
export function resolveSchemaPath(schemaPath: string, filename: string, cwd: string): string {
  // If absolute, use as-is
  if (schemaPath.startsWith('/')) {
    return schemaPath
  }

  // Try relative to cwd first (most common case for monorepos)
  const fromCwd = resolve(cwd, schemaPath)
  if (existsSync(fromCwd)) {
    return fromCwd
  }

  // Try relative to file being linted
  const fromFile = resolve(dirname(filename), schemaPath)
  if (existsSync(fromFile)) {
    return fromFile
  }

  // Default to cwd-relative (let loadSchema handle the error)
  return fromCwd
}

/**
 * Load schema synchronously with caching.
 *
 * @param absolutePath - Absolute path to schema.json
 * @returns The parsed schema, or null if loading fails
 */
export function loadSchemaSync(absolutePath: string): SchemaType | null {
  // Check cache first
  if (schemaCache.has(absolutePath)) {
    return schemaCache.get(absolutePath) ?? null
  }

  try {
    if (!existsSync(absolutePath)) {
      schemaCache.set(absolutePath, null)
      return null
    }

    const content = readFileSync(absolutePath, 'utf-8')
    const schema = JSON.parse(content) as SchemaType
    schemaCache.set(absolutePath, schema)
    return schema
  } catch {
    schemaCache.set(absolutePath, null)
    return null
  }
}

/**
 * Get schema from ESLint context settings.
 *
 * Reads settings.sanity.schemaPath and loads the schema.
 *
 * @param settings - ESLint context settings
 * @param filename - Path of file being linted
 * @param cwd - Current working directory
 * @returns The schema if configured and loadable, null otherwise
 */
export function getSchemaFromSettings(
  settings: Record<string, unknown> | undefined,
  filename: string,
  cwd: string
): SchemaType | null {
  const sanitySettings = settings?.['sanity'] as Record<string, unknown> | undefined
  const schemaPath = sanitySettings?.['schemaPath'] as string | undefined

  if (!schemaPath) {
    return null
  }

  const absolutePath = resolveSchemaPath(schemaPath, filename, cwd)
  return loadSchemaSync(absolutePath)
}

/**
 * Clear the schema cache.
 * Useful for testing or when schema files change.
 */
export function clearSchemaCache(): void {
  schemaCache.clear()
}
