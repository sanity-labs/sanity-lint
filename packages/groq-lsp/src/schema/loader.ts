/**
 * Schema loading and caching for the LSP server
 *
 * Handles:
 * - Loading schema.json from disk
 * - Auto-discovery of schema files
 * - Caching and invalidation
 * - File watching for hot-reload
 */

import { readFileSync, existsSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join, resolve } from 'node:path'
import { FileChangeType, type FileEvent } from 'vscode-languageserver'
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

/**
 * SchemaLoader manages schema state for the LSP server
 */
export class SchemaLoader {
  private state: SchemaState = {}
  private workspaceRoot: string | undefined
  private watcher: FSWatcher | null = null
  private onChangeCallback: ((schema: SchemaType | undefined) => void) | null = null

  /**
   * True when filePath is one of the well-known schema locations under the
   * discovered workspace root (same set discoverSchema searches).
   */
  private isCandidatePath(filePath: string): boolean {
    const workspaceRoot = this.workspaceRoot
    if (!workspaceRoot) {
      return false
    }
    const resolved = resolve(filePath)
    return SCHEMA_CANDIDATES.some((candidate) => resolve(workspaceRoot, candidate) === resolved)
  }

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

      const content = readFileSync(schemaPath, 'utf-8')
      const schema = JSON.parse(content) as SchemaType
      const stats = statSync(schemaPath)

      this.state = {
        schema,
        path: schemaPath,
        lastModified: stats.mtimeMs,
      }

      return this.state
    } catch (e) {
      this.state = {
        path: schemaPath,
        error: `Failed to load schema: ${e instanceof Error ? e.message : String(e)}`,
      }
      return this.state
    }
  }

  /**
   * Auto-discover schema file in workspace
   */
  discoverSchema(workspaceRoot: string): SchemaState {
    this.workspaceRoot = workspaceRoot

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
  handleFileEvents(events: readonly FileEvent[]): boolean {
    let changed = false

    for (const event of events) {
      const filePath = URI.parse(event.uri).fsPath
      const isActive = !!this.state.path && resolve(this.state.path) === resolve(filePath)

      switch (event.type) {
        case FileChangeType.Created:
        case FileChangeType.Changed:
          if (isActive || (!this.state.schema && this.isCandidatePath(filePath))) {
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
    } catch (e) {
      // Watching may fail on some file systems
      console.error(`Failed to watch schema file: ${e}`)
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
    this.workspaceRoot = undefined
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
