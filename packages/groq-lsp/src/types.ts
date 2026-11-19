/**
 * Types for the GROQ Language Server
 */

import type { SchemaType } from 'groq-js'

/**
 * Represents a GROQ query found in a document
 */
export interface GroqQuery {
  /** The GROQ query string */
  query: string
  /** Start offset in the document */
  start: number
  /** End offset in the document */
  end: number
  /** Line number (0-indexed) */
  line: number
  /** Column number (0-indexed) */
  column: number
  /** Whether the query is a template literal with `${}` interpolations. */
  interpolated?: boolean
  /**
   * The query with its `${}` fragments inlined, from `resolveQueryFragments()`. Diagnostics lint
   * this text and report what they find on the whole template as written.
   */
  resolved?: string
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  /** Path to schema.json file */
  schemaPath?: string
  /** Whether to watch for schema changes */
  watchSchema?: boolean
  /** Root directory for schema discovery */
  workspaceRoot?: string
}

/**
 * Schema state maintained by the server
 */
export interface SchemaState {
  /** The loaded schema, if any */
  schema?: SchemaType
  /** Path the schema was loaded from */
  path?: string
  /** Last modification time */
  lastModified?: number
  /** Loading error, if any */
  error?: string
}

/**
 * Document state maintained per-file
 */
export interface DocumentState {
  /** Document URI */
  uri: string
  /** Document content */
  content: string
  /** Extracted GROQ queries */
  queries: Array<GroqQuery>
  /** Document version for incremental updates */
  version: number
}

/**
 * Result from extracting GROQ from source files
 */
export interface ExtractionResult {
  /** Extracted queries with positions */
  queries: Array<GroqQuery>
  /** Any extraction errors */
  errors: Array<string>
}

/**
 * Type information for hover display
 */
export interface TypeInfo {
  /** Human-readable type description */
  type: string
  /** Optional documentation */
  documentation?: string
  /** Source schema type name */
  schemaType?: string
}
