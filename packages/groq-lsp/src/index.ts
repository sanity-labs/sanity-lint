/**
 * GROQ Language Server Protocol implementation
 *
 * This package provides an LSP server for GROQ, offering:
 * - Diagnostics (via @sanity/groq-lint)
 * - Hover information
 * - Auto-completion
 * - Formatting (via prettier-plugin-groq)
 *
 * ## Usage
 *
 * ### As a standalone server (CLI)
 * ```bash
 * npx @sanity-labs/groq-lsp
 * ```
 *
 * ### As a library
 * ```typescript
 * import { SchemaLoader, extractQueries, computeDocumentDiagnostics } from '@sanity-labs/groq-lsp'
 *
 * const loader = new SchemaLoader()
 * loader.loadFromPath('./schema.json')
 *
 * const { queries } = extractQueries(sourceCode, 'typescript')
 * const diagnostics = computeDocumentDiagnostics(queries, { schema: loader.getSchema() })
 * ```
 *
 * @packageDocumentation
 */

// Schema loading
export { SchemaLoader, getSchemaLoader } from './schema/loader.js'

// Query extraction
export { extractQueries, findQueryAtOffset, offsetToQueryPosition } from './utils/groq-extractor.js'

// Capabilities
export {
  computeQueryDiagnostics,
  computeDocumentDiagnostics,
  positionToQueryOffset,
  type DiagnosticsOptions,
  type QueryDiagnostics,
} from './capabilities/diagnostics.js'

export { getHoverInfo, type HoverOptions } from './capabilities/hover.js'

export {
  getCompletions,
  getCompletionTriggerCharacters,
  type CompletionOptions,
} from './capabilities/completion.js'

export {
  formatQuery,
  formatDocument,
  formatGroqFile,
  type FormattingOptions,
} from './capabilities/formatting.js'

// Types
export type {
  GroqQuery,
  ServerConfig,
  SchemaState,
  DocumentState,
  ExtractionResult,
  TypeInfo,
} from './types.js'
