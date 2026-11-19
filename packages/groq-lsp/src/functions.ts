/**
 * Custom GROQ functions without the language server or WASM: groq-content-mapper's settings and
 * the definitions they share, the definitions and calls in GROQ source, and whether a document is
 * only definitions. For editor features that run outside the language server.
 */

export { isDefinitionsOnly } from '@sanity-labs/groq-lint/definitions'
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
  type DefinitionProblem,
  type FunctionNameSpan,
  type ParsedDefinitions,
  type ScannedDefinition,
} from './content-mapper/groq-scanner.js'
