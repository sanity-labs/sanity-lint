#!/usr/bin/env node
/**
 * GROQ Language Server
 *
 * Provides IDE features for GROQ queries:
 * - Diagnostics (linting)
 * - Hover (type information)
 * - Completion (fields, functions, types)
 * - Formatting (via groq-format in @sanity-labs/groq-wasm)
 * - Go to definition and find references for custom functions
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
  type Location,
  type LocationLink,
  type ReferenceParams,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import type { SchemaType } from 'groq-js'

import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { ContentMapperConfigs, type ContentMapperConfig } from './content-mapper/config.js'
import type { GroqFunction } from './content-mapper/functions.js'
import { SchemaFileCache, SchemaLoader, SCHEMA_WATCH_GLOBS } from './schema/loader.js'
import { extractQueries, findQueryAtOffset, offsetToQueryPosition } from './utils/groq-extractor.js'
import { computeDocumentDiagnostics } from './capabilities/diagnostics.js'
import { FragmentFiles } from './fragments/files.js'
import { getHoverInfo } from './capabilities/hover.js'
import { getCompletions, getCompletionTriggerCharacters } from './capabilities/completion.js'
import { formatDocument, formatGroqFile } from './capabilities/formatting.js'
import {
  contentMapperGroqFiles,
  getFunctionDefinition,
  getFunctionReferences,
  type FileSpan,
  type FunctionNavigationContext,
} from './capabilities/function-navigation.js'
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
      // Custom functions
      definitionProvider: true,
      referencesProvider: true,
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
    documents.all().forEach((document) => void validateDocument(document))
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
  documents.all().forEach((document) => void validateDocument(document))
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
    documents.all().forEach((document) => void validateDocument(document))
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

// Fragments interpolated into queries are read from open documents first, so unsaved edits to
// them are used.
const fragmentFiles = new FragmentFiles((file) =>
  documents
    .all()
    .find((document) => filePath(document.uri) === file)
    ?.getText()
)

function filePath(uri: string): string | undefined {
  const parsed = URI.parse(uri)
  return parsed.scheme === 'file' ? parsed.fsPath : undefined
}

/** Re-validates the open documents whose queries use fragments from the document at `uri`. */
function validateDependents(uri: string): void {
  const file = filePath(uri)
  for (const dependent of file ? fragmentFiles.dependents(file) : []) {
    const document = documents.all().find((each) => filePath(each.uri) === dependent)
    if (document && document.uri !== uri) {
      void validateDocument(document)
    }
  }
}

/**
 * Document opened or changed
 */
documents.onDidChangeContent((change) => {
  void validateDocument(change.document)
  validateDependents(change.document.uri)
})

/**
 * Document closed
 */
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri)
  documentStates.delete(e.document.uri)
  const file = filePath(e.document.uri)
  if (file) {
    fragmentFiles.forget(file)
  }
  // Their fragments are read from disk now, without the closed document's unsaved edits.
  validateDependents(e.document.uri)
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
async function validateDocument(document: TextDocument): Promise<void> {
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

  // Lint interpolated queries with their `${}` fragments inlined. Hover and completion keep
  // working on the template as written.
  const file = filePath(uri)
  let linted = queries
  try {
    linted = file ? await fragmentFiles.resolve(file, content, queries) : queries
  } catch (error) {
    connection.console.warn(`Could not resolve GROQ fragments in ${uri}: ${String(error)}`)
  }
  if (documents.get(uri)?.version !== document.version) {
    // The document changed or closed while its fragments were read.
    return
  }

  // Compute diagnostics
  const diagnostics = computeDocumentDiagnostics(linted, contextFor(uri))

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

/** An open document's text, else the file's on disk. */
function readText(file: string): string | undefined {
  const open = documents.all().find((document) => filePath(document.uri) === file)
  if (open) {
    return open.getText()
  }
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function navigationContext(uri: string): FunctionNavigationContext | undefined {
  const document = documents.get(uri)
  const file = filePath(uri)
  if (!document || !file) {
    return undefined
  }
  const config = contentMapperConfigs.forFile(file)
  return {
    file,
    text: document.getText(),
    languageId: document.languageId,
    functions: contextFor(uri).functions,
    read: readText,
    groqFiles: () => (config ? contentMapperGroqFiles(config) : []),
  }
}

function spanRange(span: FileSpan, start = span.start, end = span.end) {
  const text = readText(span.file) ?? ''
  const document = TextDocument.create(URI.file(span.file).toString(), 'groq', 0, text)
  return { start: document.positionAt(start), end: document.positionAt(end) }
}

/**
 * Go to the definition of a custom function
 */
connection.onDefinition((params: TextDocumentPositionParams): Array<LocationLink> => {
  const context = navigationContext(params.textDocument.uri)
  const document = documents.get(params.textDocument.uri)
  const found =
    context && document && getFunctionDefinition(context, document.offsetAt(params.position))
  if (!found) {
    return []
  }
  return [
    {
      originSelectionRange: spanRange(found.origin),
      targetUri: URI.file(found.target.file).toString(),
      targetRange: spanRange(found.target),
      targetSelectionRange: spanRange(found.target, found.target.nameStart, found.target.nameEnd),
    },
  ]
})

/**
 * Find the calls of a custom function
 */
connection.onReferences((params: ReferenceParams): Array<Location> => {
  const context = navigationContext(params.textDocument.uri)
  const document = documents.get(params.textDocument.uri)
  if (!context || !document) {
    return []
  }
  return getFunctionReferences(
    context,
    document.offsetAt(params.position),
    params.context.includeDeclaration
  ).map((span) => ({ uri: URI.file(span.file).toString(), range: spanRange(span) }))
})

// Start listening
documents.listen(connection)
connection.listen()
