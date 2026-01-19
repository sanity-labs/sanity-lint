/**
 * Diagnostics capability for the GROQ Language Server
 *
 * Converts groq-lint findings to LSP diagnostics
 */

import type { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver'
import { lint, type Finding, type Severity } from '@sanity-labs/groq-lint'
import type { SchemaType } from 'groq-js'
import type { GroqQuery } from '../types.js'

/**
 * Options for computing diagnostics
 */
export interface DiagnosticsOptions {
  /** Schema for schema-aware rules */
  schema?: SchemaType | undefined
}

/**
 * Result of computing diagnostics for a query
 */
export interface QueryDiagnostics {
  /** The query that was analyzed */
  query: GroqQuery
  /** Diagnostics found */
  diagnostics: Diagnostic[]
  /** Parse error if query was invalid */
  parseError?: string
}

/**
 * Compute diagnostics for a single GROQ query
 */
export function computeQueryDiagnostics(
  query: GroqQuery,
  options: DiagnosticsOptions = {}
): QueryDiagnostics {
  const result = lint(query.query, options.schema ? { schema: options.schema } : undefined)

  if (result.parseError) {
    // Create a diagnostic for the parse error
    const diagnostic: Diagnostic = {
      range: {
        start: { line: query.line, character: query.column },
        end: { line: query.line, character: query.column + query.query.length },
      },
      severity: 1 as DiagnosticSeverity, // Error
      source: 'groq',
      message: `Parse error: ${result.parseError}`,
    }

    return {
      query,
      diagnostics: [diagnostic],
      parseError: result.parseError,
    }
  }

  // Convert findings to diagnostics
  const diagnostics = result.findings.map((finding) => findingToDiagnostic(finding, query))

  return { query, diagnostics }
}

/**
 * Compute diagnostics for multiple queries in a document
 */
export function computeDocumentDiagnostics(
  queries: GroqQuery[],
  options: DiagnosticsOptions = {}
): Diagnostic[] {
  const allDiagnostics: Diagnostic[] = []

  for (const query of queries) {
    const result = computeQueryDiagnostics(query, options)
    allDiagnostics.push(...result.diagnostics)
  }

  return allDiagnostics
}

/**
 * Convert a groq-lint Finding to an LSP Diagnostic
 */
function findingToDiagnostic(finding: Finding, query: GroqQuery): Diagnostic {
  const range = findingToRange(finding, query)

  const diagnostic: Diagnostic = {
    range,
    severity: severityToLsp(finding.severity),
    source: 'groq',
    code: finding.ruleId,
    message: finding.message,
  }

  // Add help text as related information if available
  if (finding.help) {
    diagnostic.message += `\n\nHelp: ${finding.help}`
  }

  return diagnostic
}

/**
 * Convert a Finding's span to an LSP Range
 * Adjusts positions based on query location in document
 */
function findingToRange(finding: Finding, query: GroqQuery): Range {
  if (finding.span) {
    // Adjust line and column based on query position in document
    const startLine = query.line + finding.span.start.line - 1
    const endLine = query.line + finding.span.end.line - 1

    // For the first line of a multi-line span, add the query column offset
    const startChar =
      finding.span.start.line === 1
        ? query.column + finding.span.start.column - 1
        : finding.span.start.column - 1

    const endChar =
      finding.span.end.line === 1
        ? query.column + finding.span.end.column - 1
        : finding.span.end.column - 1

    return {
      start: { line: startLine, character: startChar },
      end: { line: endLine, character: endChar },
    }
  }

  // No span - highlight the entire query
  return {
    start: { line: query.line, character: query.column },
    end: { line: query.line, character: query.column + query.query.length },
  }
}

/**
 * Convert groq-lint Severity to LSP DiagnosticSeverity
 */
function severityToLsp(severity: Severity): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return 1 // DiagnosticSeverity.Error
    case 'warning':
      return 2 // DiagnosticSeverity.Warning
    case 'info':
      return 3 // DiagnosticSeverity.Information
    default:
      return 4 // DiagnosticSeverity.Hint
  }
}

/**
 * Convert LSP Position to offset within a query
 */
export function positionToQueryOffset(
  position: Position,
  query: GroqQuery,
  _documentLines: string[]
): number | null {
  // Check if position is within the query
  const queryLines = query.query.split('\n')
  const queryEndLine = query.line + queryLines.length - 1

  if (position.line < query.line || position.line > queryEndLine) {
    return null
  }

  // Calculate offset within the query
  let offset = 0

  for (let i = query.line; i < position.line; i++) {
    const lineInQuery = i - query.line
    if (lineInQuery < queryLines.length) {
      offset += (queryLines[lineInQuery]?.length ?? 0) + 1 // +1 for newline
    }
  }

  // Add character offset for the final line
  const lineInQuery = position.line - query.line
  if (lineInQuery === 0) {
    // First line of query - subtract query column offset
    offset += position.character - query.column
  } else {
    offset += position.character
  }

  // Validate offset is within query bounds
  if (offset < 0 || offset > query.query.length) {
    return null
  }

  return offset
}
