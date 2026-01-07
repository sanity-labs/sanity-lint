#!/usr/bin/env node
/**
 * GROQ Language Server
 *
 * Provides IDE features for GROQ queries:
 * - Diagnostics (linting)
 * - Hover (type information)
 * - Completion (fields, functions, types)
 * - Formatting (via prettier-plugin-groq)
 */

import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  InitializeResult,
  DidChangeConfigurationNotification,
  type InitializeParams,
  type TextDocumentPositionParams,
  type DocumentFormattingParams,
  type CompletionParams,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'

import { SchemaLoader } from './schema/loader.js'
import { extractQueries, findQueryAtOffset, offsetToQueryPosition } from './utils/groq-extractor.js'
import { computeDocumentDiagnostics } from './capabilities/diagnostics.js'
import { getHoverInfo } from './capabilities/hover.js'
import { getCompletions, getCompletionTriggerCharacters } from './capabilities/completion.js'
import { formatDocument, formatGroqFile } from './capabilities/formatting.js'
import type { GroqQuery, DocumentState } from './types.js'
import { initLinter } from '@sanity/groq-lint'
import { initWasmFormatter } from '@sanity/prettier-plugin-groq'

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all)

// Document manager
const documents = new TextDocuments(TextDocument)

// Schema loader
const schemaLoader = new SchemaLoader()

// Document states (caches extracted queries)
const documentStates = new Map<string, DocumentState>()

// Server capabilities
let hasConfigurationCapability = false
let hasWorkspaceFolderCapability = false

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
connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined)
  }

  // Initialize WASM for better performance (linting and formatting)
  try {
    const [linterWasm, formatterWasm] = await Promise.all([initLinter(), initWasmFormatter()])
    if (linterWasm) {
      connection.console.log('WASM linter initialized')
    }
    if (formatterWasm) {
      connection.console.log('WASM formatter initialized')
    }
  } catch {
    // WASM not available, using TypeScript fallback
  }

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
    connection.sendDiagnostics({ uri, diagnostics: [] })
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
    connection.sendDiagnostics({ uri, diagnostics: [] })
    return
  }

  // Compute diagnostics
  const schema = schemaLoader.getSchema()
  const diagnostics = computeDocumentDiagnostics(queries, { schema })

  // Apply limit
  const maxDiagnostics = globalSettings.maxDiagnostics ?? 100
  const limitedDiagnostics = diagnostics.slice(0, maxDiagnostics)

  // Send diagnostics
  connection.sendDiagnostics({ uri, diagnostics: limitedDiagnostics })
}

/**
 * Find the query at a position in a document
 */
function findQueryAtPosition(
  document: TextDocument,
  position: { line: number; character: number }
): GroqQuery | undefined {
  const state = documentStates.get(document.uri)
  if (!state) return undefined

  // Convert LSP position to offset
  const offset = document.offsetAt(position)
  return findQueryAtOffset(state.queries, offset)
}

/**
 * Hover handler
 */
connection.onHover((params: TextDocumentPositionParams) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) return null

  const query = findQueryAtPosition(document, params.position)
  if (!query) return null

  // Get offset within the query
  const documentOffset = document.offsetAt(params.position)
  const queryOffset = offsetToQueryPosition(query, documentOffset)

  const schema = schemaLoader.getSchema()
  return getHoverInfo(query, queryOffset, { schema })
})

/**
 * Completion handler
 */
connection.onCompletion((params: CompletionParams) => {
  const document = documents.get(params.textDocument.uri)
  if (!document) return []

  const query = findQueryAtPosition(document, params.position)
  if (!query) {
    // Not inside a query, provide no completions
    return []
  }

  // Get offset within the query
  const documentOffset = document.offsetAt(params.position)
  const queryOffset = offsetToQueryPosition(query, documentOffset)

  const schema = schemaLoader.getSchema()
  return getCompletions(query, queryOffset, { schema })
})

/**
 * Formatting handler
 */
connection.onDocumentFormatting(async (params: DocumentFormattingParams) => {
  if (!globalSettings.enableFormatting) {
    return []
  }

  const document = documents.get(params.textDocument.uri)
  if (!document) return []

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
