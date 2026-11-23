import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { FileChangeType } from 'vscode-languageserver'
import { SchemaLoader, SCHEMA_WATCH_GLOBS } from '../schema/loader'

describe('SchemaLoader', () => {
  let loader: SchemaLoader
  let tempDir: string

  beforeEach(() => {
    loader = new SchemaLoader()
    tempDir = join(tmpdir(), `groq-lsp-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    loader.clear()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('loadFromPath', () => {
    it('should load valid schema file', () => {
      const schemaPath = join(tempDir, 'schema.json')
      const schema = [{ type: 'document', name: 'post', attributes: {} }]
      writeFileSync(schemaPath, JSON.stringify(schema))

      const result = loader.loadFromPath(schemaPath)

      expect(result.error).toBeUndefined()
      expect(result.schema).toEqual(schema)
      expect(result.path).toBe(schemaPath)
    })

    it('should return error for non-existent file', () => {
      const result = loader.loadFromPath('/non/existent/path.json')

      expect(result.error).toContain('not found')
      expect(result.schema).toBeUndefined()
    })

    it('should return error for invalid JSON', () => {
      const schemaPath = join(tempDir, 'invalid.json')
      writeFileSync(schemaPath, 'not valid json {{{')

      const result = loader.loadFromPath(schemaPath)

      expect(result.error).toContain('Failed to load schema')
      expect(result.schema).toBeUndefined()
    })

    it('should track last modified time', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')

      const result = loader.loadFromPath(schemaPath)

      expect(result.lastModified).toBeDefined()
      expect(typeof result.lastModified).toBe('number')
    })
  })

  describe('discoverSchema', () => {
    it('should find schema.json in workspace root', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')

      const result = loader.discoverSchema(tempDir)

      expect(result.path).toBe(schemaPath)
      expect(result.error).toBeUndefined()
    })

    it('should find sanity.schema.json', () => {
      const schemaPath = join(tempDir, 'sanity.schema.json')
      writeFileSync(schemaPath, '[]')

      const result = loader.discoverSchema(tempDir)

      expect(result.path).toBe(schemaPath)
    })

    it('should find .sanity/schema.json', () => {
      const sanityDir = join(tempDir, '.sanity')
      mkdirSync(sanityDir, { recursive: true })
      const schemaPath = join(sanityDir, 'schema.json')
      writeFileSync(schemaPath, '[]')

      const result = loader.discoverSchema(tempDir)

      expect(result.path).toBe(schemaPath)
    })

    it('should return error when no schema found', () => {
      const result = loader.discoverSchema(tempDir)

      expect(result.error).toContain('No schema.json found')
      expect(result.schema).toBeUndefined()
    })

    it('should prefer schema.json over other candidates', () => {
      // Create both files
      writeFileSync(join(tempDir, 'schema.json'), '["first"]')
      writeFileSync(join(tempDir, 'sanity.schema.json'), '["second"]')

      const result = loader.discoverSchema(tempDir)

      expect(result.path).toBe(join(tempDir, 'schema.json'))
    })
  })

  describe('getState', () => {
    it('should return current state', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      const state = loader.getState()

      expect(state.path).toBe(schemaPath)
      expect(state.schema).toEqual([])
    })

    it('should return empty state initially', () => {
      const state = loader.getState()

      expect(state.schema).toBeUndefined()
      expect(state.path).toBeUndefined()
    })
  })

  describe('getSchema', () => {
    it('should return loaded schema', () => {
      const schemaPath = join(tempDir, 'schema.json')
      const schema = [{ type: 'document', name: 'test', attributes: {} }]
      writeFileSync(schemaPath, JSON.stringify(schema))
      loader.loadFromPath(schemaPath)

      expect(loader.getSchema()).toEqual(schema)
    })

    it('should return undefined when no schema loaded', () => {
      expect(loader.getSchema()).toBeUndefined()
    })
  })

  describe('needsReload', () => {
    it('should return false when no schema loaded', () => {
      expect(loader.needsReload()).toBe(false)
    })

    it('should return false when file not modified', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      expect(loader.needsReload()).toBe(false)
    })

    it('should return true when file modified', async () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      // Wait a bit and modify the file
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
      writeFileSync(schemaPath, '[{"type": "document"}]')

      expect(loader.needsReload()).toBe(true)
    })
  })

  describe('reloadIfNeeded', () => {
    it('should not reload when file not changed', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      const result = loader.reloadIfNeeded()

      expect(result).toBe(false)
    })

    it('should reload when file changed', async () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      // Wait and modify
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })
      writeFileSync(schemaPath, '[{"name": "updated"}]')

      const result = loader.reloadIfNeeded()

      expect(result).toBe(true)
      expect(loader.getSchema()).toEqual([{ name: 'updated' }])
    })
  })

  describe('clear', () => {
    it('should clear loaded schema', () => {
      const schemaPath = join(tempDir, 'schema.json')
      writeFileSync(schemaPath, '[]')
      loader.loadFromPath(schemaPath)

      loader.clear()

      expect(loader.getSchema()).toBeUndefined()
      expect(loader.getState().path).toBeUndefined()
    })
  })
})

describe('SchemaLoader.handleFileEvents', () => {
  let loader: SchemaLoader
  let tempDir: string
  let schemaPath: string

  const post = [{ type: 'document', name: 'post', attributes: {} }]
  const article = [{ type: 'document', name: 'article', attributes: {} }]

  beforeEach(() => {
    loader = new SchemaLoader()
    tempDir = join(tmpdir(), `groq-lsp-events-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(tempDir, { recursive: true })
    schemaPath = join(tempDir, 'schema.json')
  })

  afterEach(() => {
    loader.clear()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('reloads the active schema on a Changed event', () => {
    writeFileSync(schemaPath, JSON.stringify(post))
    loader.loadFromPath(schemaPath)
    writeFileSync(schemaPath, JSON.stringify(article))

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Changed },
    ])

    expect(changed).toBe(true)
    expect(loader.getSchema()).toEqual(article)
  })

  it('clears the active schema on a Deleted event', () => {
    writeFileSync(schemaPath, JSON.stringify(post))
    loader.loadFromPath(schemaPath)
    rmSync(schemaPath)

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Deleted },
    ])

    expect(changed).toBe(true)
    expect(loader.getSchema()).toBeUndefined()
    expect(loader.getState().error).toContain('not found')
  })

  it('loads a well-known schema file created after startup when none is loaded', () => {
    loader.discoverSchema(tempDir)
    expect(loader.getSchema()).toBeUndefined()
    writeFileSync(schemaPath, JSON.stringify(post))

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Created },
    ])

    expect(changed).toBe(true)
    expect(loader.getSchema()).toEqual(post)
    expect(loader.getState().path).toBe(schemaPath)
  })

  it('does not replace a loaded schema with a different candidate file', () => {
    writeFileSync(schemaPath, JSON.stringify(post))
    loader.loadFromPath(schemaPath)
    mkdirSync(join(tempDir, '.sanity'))
    const other = join(tempDir, '.sanity', 'schema.json')
    writeFileSync(other, JSON.stringify(article))

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(other).toString(), type: FileChangeType.Created },
    ])

    expect(changed).toBe(false)
    expect(loader.getSchema()).toEqual(post)
  })

  it('ignores unrelated files', () => {
    writeFileSync(schemaPath, JSON.stringify(post))
    loader.loadFromPath(schemaPath)
    const unrelated = join(tempDir, 'package.json')
    writeFileSync(unrelated, '{}')

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(unrelated).toString(), type: FileChangeType.Changed },
      { uri: pathToFileURL(unrelated).toString(), type: FileChangeType.Deleted },
    ])

    expect(changed).toBe(false)
    expect(loader.getSchema()).toEqual(post)
  })

  it('ignores a Deleted event for a file that is not the active schema', () => {
    const other = join(tempDir, 'sanity.schema.json')
    writeFileSync(schemaPath, JSON.stringify(post))
    loader.loadFromPath(schemaPath)

    const changed = loader.handleFileEvents([
      { uri: pathToFileURL(other).toString(), type: FileChangeType.Deleted },
    ])

    expect(changed).toBe(false)
    expect(loader.getSchema()).toEqual(post)
  })

  it('exposes watch globs for every schema candidate', () => {
    expect(SCHEMA_WATCH_GLOBS).toEqual([
      '**/schema.json',
      '**/sanity.schema.json',
      '**/.sanity/schema.json',
      '**/studio/schema.json',
    ])
  })
})
