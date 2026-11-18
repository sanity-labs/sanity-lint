#!/usr/bin/env node
/**
 * GROQ Language Server
 *
 * Provides IDE features for GROQ queries:
 * - Diagnostics (linting)
 * - Hover (type information)
 * - Completion (fields, functions, types)
 * - Formatting (via groq-format in @sanity-labs/groq-wasm)
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  InitializeResult,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  type InitializeParams,
  type TextDocumentPositionParams,
  type DocumentFormattingParams,
  type CompletionParams,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import type { SchemaType } from 'groq-js'

import { basename, extname } from 'node:path'
import { ContentMapperConfigs, type ContentMapperConfig } from './content-mapper/config.js'
import type { GroqFunction } from './content-mapper/functions.js'
import { SchemaFileCache, SchemaLoader, SCHEMA_WATCH_GLOBS } from './schema/loader.js'
import { extractQueries, findQueryAtOffset, offsetToQueryPosition } from './utils/groq-extractor.js'
import { computeDocumentDiagnostics } from './capabilities/diagnostics.js'
import { getHoverInfo } from './capabilities/hover.js'
import { getCompletions, getCompletionTriggerCharacters } from './capabilities/completion.js'
import { formatDocument, formatGroqFile } from './capabilities/formatting.js'
import type { GroqQuery, DocumentState } from './types.js'

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all)

// Document manager
const documents = new TextDocuments(TextDocument)

// Schema loader
const schemaLoader = new SchemaLoader()

// groq-content-mapper's tsconfig.json settings, and the schemas they name
const contentMapperConfigs = new ContentMapperConfigs()
const contentMapperSchemas = new SchemaFileCache()
const reportedProblems = new Set<string>()
const watchedGlobs = new Set<string>()

// Document states (caches extracted queries)
const documentStates = new Map<string, DocumentState>()

// Server capabilities
let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false
let hasWatchedFilesDynamicRegistration = false

/**
 * Server settings
 */
interface Settings {
  /** Path to schema.json */
  schemaPath?: string
  /** Maximum number of diagnostics to report */
  maxDiagnostics?: number
  /** Enable formatting */
  enableFormatting?: boolean
}

// Default settings
const defaultSettings: Settings = {
  maxDiagnostics: 100,
  enableFormatting: true,
}

// Global settings
let globalSettings: Settings = defaultSettings

// Per-document settings (for future use)
const documentSettings = new Map<string, Thenable<Settings>>()

/**
 * Initialize the server
 */
connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities

  hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration)
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  )

  hasWatchedFilesDynamicRegistration =
    !!capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration

  // Try to discover schema in workspace
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    const workspaceUri = params.workspaceFolders[0]?.uri
    if (workspaceUri) {
      const workspacePath = URI.parse(workspaceUri).fsPath
      schemaLoader.discoverSchema(workspacePath)
    }
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Completion
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: getCompletionTriggerCharacters(),
      },
      // Hover
      hoverProvider: true,
      // Formatting
      documentFormattingProvider: true,
      // We'll compute diagnostics on document change
    },
  }

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    }
  }

  return result
})

/**
 * After initialization
 */
connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    void connection.client.register(DidChangeConfigurationNotification.type, undefined)
  }

  watchGlobs([...SCHEMA_WATCH_GLOBS, '**/tsconfig.json', '**/*.groq'])

  // Start watching schema for changes
  schemaLoader.startWatching((schema) => {
    connection.console.log(`Schema ${schema ? 'reloaded' : 'cleared'}`)
    // Re-validate all open documents
    documents.all().forEach(validateDocument)
  })

  connection.console.log('GROQ Language Server initialized')
})

/**
 * Configuration changed
 */
connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset cached settings
    documentSettings.clear()
  }

  // Update global settings
  globalSettings = (change.settings?.groq as Settings) ?? defaultSettings

  // Load schema from settings if specified
  if (globalSettings.schemaPath) {
    schemaLoader.loadFromPath(globalSettings.schemaPath)
  }

  // Re-validate all documents
  documents.all().forEach(validateDocument)
})

/**
 * Schema files created, changed or deleted on disk
 */
connection.onDidChangeWatchedFiles((params) => {
  const schemaChanged = schemaLoader.handleFileEvents(params.changes)
  if (schemaChanged) {
    const { schema, error } = schemaLoader.getState()
    connection.console.log(schema ? 'Schema reloaded' : `Schema cleared: ${error ?? 'unknown'}`)
  }

  const mapperFiles = new Set(
    contentMapperConfigs
      .all()
      .flatMap((config) => [...config.schemaPaths, ...(config.functions?.files ?? [])])
  )
  const mapperChanged = params.changes.some(({ uri, type }) => {
    const file = URI.parse(uri).fsPath
    return (
      basename(file) === 'tsconfig.json' ||
      mapperFiles.has(file) ||
      // A new or deleted .groq file may be one a `functions` glob matches.
      (extname(file) === '.groq' && type !== FileChangeType.Changed)
    )
  })
  if (mapperChanged) {
    contentMapperConfigs.invalidate()
    contentMapperSchemas.clear()
    reportedProblems.clear()
  }

  if (schemaChanged || mapperChanged) {
    documents.all().forEach(validateDocument)
  }
})

function watchGlobs(globs: Array<string>): void {
  const added = globs.filter((glob) => !watchedGlobs.has(glob))
  if (!hasWatchedFilesDynamicRegistration || added.length === 0) {
    return
  }
  added.forEach((glob) => watchedGlobs.add(glob))
  void connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: added.map((globPattern) => ({ globPattern })),
  })
}

function reportOnce(problem: string): void {
  if (reportedProblems.has(problem)) {
    return
  }
  reportedProblems.add(problem)
  connection.console.warn(problem)
}

/**
 * The schema and the shared custom functions for a document.
 *
 * The schema is the one `groq.schemaPath` names, else a well-known schema file in the
 * workspace, else the one groq-content-mapper's settings in the nearest tsconfig.json give the
 * file. The functions are those of the mapper's `functions` option, for the file extensions the
 * mapper handles.
 */
interface DocumentContext {
  schema: SchemaType | undefined
  functions: Map<string, GroqFunction> | undefined
}

function contextFor(uri: string): DocumentContext {
  const parsed = URI.parse(uri)
  const file = parsed.scheme === 'file' ? parsed.fsPath : undefined
  const config: ContentMapperConfig | undefined = file
    ? contentMapperConfigs.forFile(file)
    : undefined
  if (config) {
    config.issues.forEach(reportOnce)
    watchGlobs(config.schemaPaths.map((path) => `**/${basename(path)}`))
  }

  let schema = schemaLoader.getSchema()
  const mapperSchemaPath = file && config?.schemaFor(file)
  if (!schema && mapperSchemaPath) {
    const state = contentMapperSchemas.load(mapperSchemaPath)
    if (state.error) {
      reportOnce(state.error)
    }
    schema = state.schema
  }

  return {
    schema,
    functions: file && config?.handles(file) ? config.functions?.functions : undefined,
  }
}

/**
 * Document opened or changed
 */
documents.onDidChangeContent((change) => {
  validateDocument(change.document)
})

/**
 * Document closed
 */
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri)
  documentStates.delete(e.document.uri)
})

/**
 * Check if a URI points to a file in node_modules
 */
function isNodeModulesPath(uri: string): boolean {
  return uri.includes('/node_modules/') || uri.includes('\\node_modules\\')
}

/**
 * Validate a document and send diagnostics
 */
function validateDocument(document: TextDocument): void {
  const content = document.getText()
  const languageId = document.languageId
  const uri = document.uri

  // Skip files in node_modules - they're external dependencies
  if (isNodeModulesPath(uri)) {
    void connection.sendDiagnostics({ uri, diagnostics: [] })
    return
  }

  // Extract queries from document
  const { queries } = extractQueries(content, languageId)

  // Update document state
  documentStates.set(uri, {
    uri,
    content,
    queries,
    version: document.version,
  })

  // No queries to validate
  if (queries.length === 0) {
    void connection.sendDiagnostics({ uri, diagnostics: [] })
    return
  }

  // Compute diagnostics
  const diagnostics = computeDocumentDiagnostics(queries, contextFor(uri))

  // Apply limit
  const maxDiagnostics = globalSettings.maxDiagnostics ?? 100
  const limitedDiagnostics = diagnostics.slice(0, maxDiagnostics)

  // Send diagnostics
  void connection.sendDiagnostics({ uri, diagnostics: limitedDiagnostics })
}

/**
 * Find the query at a position in a document
 */
function findQueryAtPosition(
  document: TextDocument,
  position: { line: number; character: number }
): GroqQuery | undefined {
  const state = documentStates.get(document.uri)
  if (!state) {
    return undefined
  }

  // Convert LSP position to offset
  const offset = document.offsetAt(position)
  return findQueryAtOffset(state.queries, offset)
}

/**
 * Hover handler
 */
connection.onHover((params: TextDocumentPositionParams) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return null
  }

  const query = findQueryAtPosition(document, params.position)
  if (!query) {
    return null
  }

  // Get offset within the query
  const documentOffset = document.offsetAt(params.position)
  const queryOffset = offsetToQueryPosition(query, documentOffset)

  return getHoverInfo(query, queryOffset, contextFor(document.uri))
})

/**
 * Completion handler
 */
connection.onCompletion((params: CompletionParams) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  const query = findQueryAtPosition(document, params.position)
  if (!query) {
    // Not inside a query, provide no completions
    return []
  }

  // Get offset within the query
  const documentOffset = document.offsetAt(params.position)
  const queryOffset = offsetToQueryPosition(query, documentOffset)

  return getCompletions(query, queryOffset, { schema: contextFor(document.uri).schema })
})

/**
 * Formatting handler
 */
connection.onDocumentFormatting(async (params: DocumentFormattingParams) => {
  if (!globalSettings.enableFormatting) {
    return []
  }

  const document = documents.get(params.textDocument.uri)
  if (!document) {
    return []
  }

  const content = document.getText()
  const languageId = document.languageId

  // Handle .groq files specially (entire file is GROQ)
  if (languageId === 'groq') {
    return formatGroqFile(content, {
      tabSize: params.options.tabSize,
      insertSpaces: params.options.insertSpaces,
    })
  }

  // For JS/TS files, format embedded queries
  const state = documentStates.get(document.uri)
  if (!state || state.queries.length === 0) {
    return []
  }

  return formatDocument(state.queries, content, {
    tabSize: params.options.tabSize,
    insertSpaces: params.options.insertSpaces,
  })
})

// Start listening
documents.listen(connection)
connection.listen()
