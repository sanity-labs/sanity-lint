/**
 * Schema loading and caching for the LSP server
 *
 * Handles:
 * - Loading schema.json from disk
 * - Auto-discovery of schema files
 * - Caching and invalidation
 * - File watching for hot-reload
 */

import { readFileSync, existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { join, resolve } from 'node:path'
import { FileChangeType } from 'vscode-languageserver'
import type { FileEvent } from 'vscode-languageserver'
import { URI } from 'vscode-uri'
import type { SchemaType } from 'groq-js'
import type { SchemaState } from '../types.js'

/**
 * Well-known schema file locations to search for
 */
const SCHEMA_CANDIDATES = [
  'schema.json',
  'sanity.schema.json',
  '.sanity/schema.json',
  'studio/schema.json',
]

/**
 * Glob patterns matching the well-known schema locations, for file watchers
 */
export const SCHEMA_WATCH_GLOBS = SCHEMA_CANDIDATES.map((candidate) => `**/${candidate}`)

function isCandidatePath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/')
  return SCHEMA_CANDIDATES.some((candidate) => normalized.endsWith(`/${candidate}`))
}

/**
 * SchemaLoader manages schema state for the LSP server
 */
export class SchemaLoader {
  private state: SchemaState = {}
  private watcher: FSWatcher | null = null
  private onChangeCallback: ((schema: SchemaType | undefined) => void) | null = null

  /**
   * Load schema from a specific path
   */
  loadFromPath(schemaPath: string): SchemaState {
    try {
      if (!existsSync(schemaPath)) {
        this.state = {
          path: schemaPath,
          error: `Schema file not found: ${schemaPath}`,
        }
        return this.state
      }

      const content = readFileSync(schemaPath, 'utf8')
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema file is Sanity's own `schema extract` output; its shape is not validated here
      const schema = JSON.parse(content) as SchemaType
      const stats = statSync(schemaPath)

      this.state = {
        schema,
        path: schemaPath,
        lastModified: stats.mtimeMs,
      }

      return this.state
    } catch (error) {
      this.state = {
        path: schemaPath,
        error: `Failed to load schema: ${error instanceof Error ? error.message : String(error)}`,
      }
      return this.state
    }
  }

  /**
   * Auto-discover schema file in workspace
   */
  discoverSchema(workspaceRoot: string): SchemaState {
    for (const candidate of SCHEMA_CANDIDATES) {
      const candidatePath = join(workspaceRoot, candidate)
      if (existsSync(candidatePath)) {
        return this.loadFromPath(candidatePath)
      }
    }

    this.state = {
      error: 'No schema.json found. Generate with: npx sanity schema extract',
    }
    return this.state
  }

  /**
   * Get the current schema state
   */
  getState(): SchemaState {
    return this.state
  }

  /**
   * Get the loaded schema (if any)
   */
  getSchema(): SchemaType | undefined {
    return this.state.schema
  }

  /**
   * Check if schema needs reloading (file changed)
   */
  needsReload(): boolean {
    if (!this.state.path || !existsSync(this.state.path)) {
      return false
    }

    try {
      const stats = statSync(this.state.path)
      return stats.mtimeMs !== this.state.lastModified
    } catch {
      return false
    }
  }

  /**
   * Reload schema if the file has changed
   */
  reloadIfNeeded(): boolean {
    if (this.needsReload() && this.state.path) {
      this.loadFromPath(this.state.path)
      return true
    }
    return false
  }

  /**
   * Apply workspace/didChangeWatchedFiles events to the schema state.
   *
   * Reloads or clears the active schema file, and picks up a newly created
   * well-known schema file when none is loaded yet.
   * Returns true when the schema state changed.
   */
  handleFileEvents(events: ReadonlyArray<FileEvent>): boolean {
    let changed = false

    for (const event of events) {
      const filePath = URI.parse(event.uri).fsPath
      const isActive = !!this.state.path && resolve(this.state.path) === resolve(filePath)

      switch (event.type) {
        case FileChangeType.Created:
        case FileChangeType.Changed:
          if (isActive || (!this.state.schema && isCandidatePath(filePath))) {
            this.loadFromPath(isActive && this.state.path ? this.state.path : filePath)
            changed = true
          }
          break
        case FileChangeType.Deleted:
          if (isActive && this.state.path) {
            this.loadFromPath(this.state.path)
            changed = true
          }
          break
        default: {
          const unhandled: never = event.type
          throw new Error(`Unhandled file change type: ${String(unhandled)}`)
        }
      }
    }

    return changed
  }

  /**
   * Start watching the schema file for changes
   */
  startWatching(onChange: (schema: SchemaType | undefined) => void): void {
    this.onChangeCallback = onChange

    if (!this.state.path || !existsSync(this.state.path)) {
      return
    }

    try {
      this.watcher = watch(this.state.path, (eventType) => {
        if (eventType === 'change' && this.state.path) {
          this.loadFromPath(this.state.path)
          this.onChangeCallback?.(this.state.schema)
        }
      })
    } catch (error) {
      // Watching may fail on some file systems
      // oxlint-disable-next-line no-console -- stderr is the language server's log channel
      console.error(`Failed to watch schema file: ${error}`)
    }
  }

  /**
   * Stop watching the schema file
   */
  stopWatching(): void {
    this.watcher?.close()
    this.watcher = null
    this.onChangeCallback = null
  }

  /**
   * Clear the loaded schema
   */
  clear(): void {
    this.stopWatching()
    this.state = {}
  }
}

/**
 * Schemas by path, each read again when its file changes on disk
 */
export class SchemaFileCache {
  private loaders = new Map<string, SchemaLoader>()

  load(schemaPath: string): SchemaState {
    const path = resolve(schemaPath)
    let loader = this.loaders.get(path)
    if (!loader) {
      loader = new SchemaLoader()
      loader.loadFromPath(path)
      this.loaders.set(path, loader)
      return loader.getState()
    }
    if (!loader.reloadIfNeeded() && !loader.getState().schema && existsSync(path)) {
      loader.loadFromPath(path)
    }
    return loader.getState()
  }

  clear(): void {
    this.loaders.clear()
  }
}

/**
 * Singleton instance for convenience
 */
let defaultLoader: SchemaLoader | null = null

export function getSchemaLoader(): SchemaLoader {
  if (!defaultLoader) {
    defaultLoader = new SchemaLoader()
  }
  return defaultLoader
}
