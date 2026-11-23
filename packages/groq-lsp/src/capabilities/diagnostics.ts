/**
 * Diagnostics capability for the GROQ Language Server
 *
 * Converts groq-lint findings to LSP diagnostics
 */

import type { Diagnostic, DiagnosticSeverity, Range, Position } from 'vscode-languageserver'
import { lint } from '@sanity-labs/groq-lint'
import type { Finding, Severity } from '@sanity-labs/groq-lint'
import type { SourceLocation } from '@sanity-labs/lint-core'
import type { SchemaType } from 'groq-js'
import {
  groqFunctionStub,
  groqFunctionStubsPrelude,
  groqFunctionsPrelude,
} from '../content-mapper/functions.js'
import type { GroqFunction } from '../content-mapper/functions.js'
import { leadingDefinitions } from '../content-mapper/groq-scanner.js'
import type { ScannedDefinition } from '../content-mapper/groq-scanner.js'
import type { GroqQuery } from '../types.js'

/**
 * Options for computing diagnostics
 */
export interface DiagnosticsOptions {
  /** Schema for schema-aware rules */
  schema?: SchemaType | undefined
  /**
   * Shared custom GROQ functions by `namespace::name`. A query that calls one is linted with the
   * definitions it needs prepended, as groq-content-mapper's loaders deliver it.
   */
  functions?: Map<string, GroqFunction> | undefined
}

/**
 * Result of computing diagnostics for a query
 */
export interface QueryDiagnostics {
  /** The query that was analyzed */
  query: GroqQuery
  /** Diagnostics found */
  diagnostics: Array<Diagnostic>
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
  if (query.interpolated && !query.resolved) {
    // Until its `${}` fragments are inlined, the template is not GROQ.
    return { query, diagnostics: [] }
  }
  const text = query.resolved ?? query.query
  const prelude = options.functions ? groqFunctionsPrelude(text, options.functions) : ''
  const lintOptions = options.schema ? { schema: options.schema } : undefined
  const result = lint(prelude ? `${prelude}\n${text}` : text, lintOptions)
  // The prelude ends with a newline, so the query's own lines only shift down.
  const preludeLines = prelude ? prelude.split('\n').length : 0
  const definitions = leadingDefinitions(text)
  const definitionDiagnostics = definitions.flatMap((definition) =>
    lintDefinition(definition, text, query, definitions, options)
  )

  if (result.parseError) {
    // Create a diagnostic for the parse error
    const diagnostic: Diagnostic = {
      range: {
        start: { line: query.line, character: query.column },
        end: { line: query.line, character: query.column + query.query.length },
      },
      severity: 1, // Error
      source: 'groq',
      message: `Parse error: ${result.parseError}`,
    }

    return {
      query,
      diagnostics: [diagnostic, ...definitionDiagnostics],
      parseError: result.parseError,
    }
  }

  const ownSpanless =
    (prelude || definitions.length > 0) && result.findings.some((finding) => !finding.span)
      ? spanlessFindingsWithoutBodies(text, definitions, options)
      : undefined

  // Convert findings to diagnostics
  const diagnostics = result.findings.flatMap((finding) => {
    if (!finding.span) {
      // groq-js inlines function bodies at each call, without positions: a finding that linting
      // with the bodies left out lacks is about a body, and its definition reports it.
      return !ownSpanless || take(ownSpanless, finding) ? [findingToDiagnostic(finding, query)] : []
    }
    if (preludeLines === 0) {
      return [findingToDiagnostic(finding, query)]
    }
    // A finding in a prepended definition belongs to its functions file, not this query.
    if (finding.span.start.line <= preludeLines) {
      return []
    }
    const shift = (location: SourceLocation): SourceLocation => ({
      ...location,
      line: location.line - preludeLines,
      offset: location.offset - prelude.length - 1,
    })
    return [
      findingToDiagnostic(
        { ...finding, span: { start: shift(finding.span.start), end: shift(finding.span.end) } },
        query
      ),
    ]
  })

  return { query, diagnostics: [...diagnostics, ...definitionDiagnostics] }
}

/**
 * The span-less findings of `text` linted with every function body it defines or calls left out,
 * or undefined when that does not parse.
 */
function spanlessFindingsWithoutBodies(
  text: string,
  definitions: Array<ScannedDefinition>,
  options: DiagnosticsOptions
): Array<Finding> | undefined {
  let stubbed = text
  for (const { start, end } of [...definitions].reverse()) {
    stubbed = `${stubbed.slice(0, start)}${groqFunctionStub(text.slice(start, end))}${stubbed.slice(end)}`
  }
  const stubs = options.functions ? groqFunctionStubsPrelude(text, options.functions) : ''
  const result = lint(
    stubs ? `${stubs}\n${stubbed}` : stubbed,
    options.schema ? { schema: options.schema } : undefined
  )
  return result.parseError ? undefined : result.findings.filter((finding) => !finding.span)
}

/** Removes a finding like `finding` from `findings`, and whether there was one. */
function take(findings: Array<Finding>, finding: Finding): boolean {
  const index = findings.findIndex(
    (each) => each.ruleId === finding.ruleId && each.message === finding.message
  )
  if (index === -1) {
    return false
  }
  findings.splice(index, 1)
  return true
}

/**
 * What linting finds in the body of a definition `text`, the query as linted, starts with,
 * reported on its name.
 *
 * groq-js inlines a body only where it is called, so the definition is linted with one call, and
 * with the functions it calls left out: what they contain their own definitions report. A
 * finding that linting with this body left out also has comes from the call, not the body.
 */
function lintDefinition(
  definition: ScannedDefinition,
  text: string,
  query: GroqQuery,
  definitions: Array<ScannedDefinition>,
  options: DiagnosticsOptions
): Array<Diagnostic> {
  const sourceOf = (name: string) => {
    const own = definitions.find((each) => each.name === name)
    return own ? text.slice(own.start, own.end) : options.functions?.get(name)?.source
  }
  const stubs: Array<string> = []
  for (const call of definition.calls) {
    const source = sourceOf(call)
    if (source === undefined) {
      return []
    }
    stubs.push(groqFunctionStub(source))
  }
  const source = text.slice(definition.start, definition.end)
  const lintOptions = options.schema ? { schema: options.schema } : undefined
  const withBody = (body: string) =>
    lint([...stubs, body, `{"_": ${definition.name}(@)}`].join('\n'), lintOptions)
  const result = withBody(source)
  if (result.parseError) {
    return []
  }
  const withoutBody = withBody(groqFunctionStub(source)).findings.filter((each) => !each.span)

  const nameStart = text.indexOf(definition.name, definition.start)
  const span = {
    start: locationAt(text, nameStart),
    end: locationAt(text, nameStart + definition.name.length),
  }
  return result.findings
    .filter((finding) => !finding.span && !take(withoutBody, finding))
    .map((finding) => findingToDiagnostic({ ...finding, span }, query))
}

/** The 1-based line and column of `offset` in `text`. */
function locationAt(text: string, offset: number): SourceLocation {
  const before = text.slice(0, offset)
  const lineStart = before.lastIndexOf('\n') + 1
  return { line: before.split('\n').length, column: offset - lineStart + 1, offset }
}

/**
 * Compute diagnostics for multiple queries in a document
 */
export function computeDocumentDiagnostics(
  queries: Array<GroqQuery>,
  options: DiagnosticsOptions = {}
): Array<Diagnostic> {
  const allDiagnostics: Array<Diagnostic> = []

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
  // Offsets in a resolved query do not match the template as written.
  if (finding.span && !query.resolved) {
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
  _documentLines: Array<string>
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
