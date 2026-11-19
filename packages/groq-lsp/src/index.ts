/**
 * GROQ Language Server Protocol implementation
 *
 * This package provides an LSP server for GROQ, offering:
 * - Diagnostics (via @sanity/groq-lint)
 * - Hover information
 * - Auto-completion
 * - Formatting (via groq-format in @sanity-labs/groq-wasm)
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
export { SchemaLoader, SchemaFileCache, getSchemaLoader } from './schema/loader.js'

// groq-content-mapper settings from tsconfig.json
export {
  CONTENT_MAPPER_PACKAGE,
  ContentMapperConfigs,
  readContentMapperConfig,
  type ContentMapperConfig,
} from './content-mapper/config.js'
export {
  groqFunctionsPrelude,
  loadGroqFunctions,
  withGroqFunctions,
  type GroqFunction,
  type LoadedGroqFunctions,
} from './content-mapper/functions.js'
export {
  findFunctionCalls,
  leadingDefinitions,
  parseDefinitions,
  type FunctionNameSpan,
  type ScannedDefinition,
} from './content-mapper/groq-scanner.js'
export { isDefinitionsOnly } from '@sanity-labs/groq-lint'

// Query extraction
export { extractQueries, findQueryAtOffset, offsetToQueryPosition } from './utils/groq-extractor.js'

// Fragments interpolated into queries (`${fragment}`)
export { resolveQueryFragments, type FragmentHost } from './fragments/index.js'
export { FragmentFiles } from './fragments/files.js'

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
  contentMapperGroqFiles,
  getFunctionDefinition,
  getFunctionReferences,
  type FileSpan,
  type FunctionDefinitionResult,
  type FunctionDefinitionTarget,
  type FunctionNavigationContext,
} from './capabilities/function-navigation.js'

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
