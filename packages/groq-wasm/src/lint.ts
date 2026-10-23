/**
 * GROQ Linting via WASM
 *
 * Wraps the Rust groq-lint library compiled to WASM.
 */

import type { Finding, SourceSpan } from '@sanity-labs/lint-core'

import { createUtf8OffsetMapper } from './offsets.js'
import {
  mapRuleId,
  mapSeverity,
  WasmError,
  type WasmFinding,
  type WasmLintConfig,
} from './types.js'
import { callLint } from './wasm-loader.js'

/**
 * Lint a GROQ query using the WASM-based linter.
 *
 * Finding spans are source locations in JavaScript string coordinates.
 * The Rust linter reports UTF-8 byte offsets; `line`, `column`, and `offset`
 * below are converted from those bytes. `column` counts UTF-16 code units.
 *
 * @param query - The GROQ query string to lint
 * @param config - Optional configuration
 * @returns Array of findings
 * @throws {WasmError} If query parsing fails
 *
 * @example
 * ```typescript
 * import {lint} from '@sanity-labs/groq-wasm'
 *
 * const findings = lint('*[_type == "post"]{ author-> }')
 * // [{ ruleId: 'join-in-filter', message: '...', severity: 'error' }]
 * ```
 */
export function lint(query: string, config?: WasmLintConfig): Finding[] {
  if (!query.trim()) {
    return []
  }

  try {
    // Call WASM function - returns JSON string
    const resultJson = callLint(query)
    const wasmFindings: WasmFinding[] = JSON.parse(resultJson)

    // Filter by config if provided
    let findings = wasmFindings
    if (config?.rules) {
      const rules = config.rules
      findings = findings.filter((f) => {
        const enabled = rules[f.ruleId]
        return enabled !== false
      })
    }

    // Convert to our Finding type
    return findings.map((wf) => convertFinding(wf, query))
  } catch (error) {
    if (error instanceof WasmError) {
      throw error
    }

    // Parse errors from WASM come as thrown strings/errors
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('parse') || message.includes('Parse')) {
      throw new WasmError(`Failed to parse query: ${message}`, 'PARSE_ERROR')
    }

    throw new WasmError(`Lint failed: ${message}`, 'WASM_ERROR')
  }
}

/**
 * Convert WASM finding to our Finding type
 */
function convertFinding(wf: WasmFinding, query: string): Finding {
  return {
    ruleId: mapRuleId(wf.ruleId),
    message: wf.message,
    severity: mapSeverity(wf.severity),
    span: byteSpanToSourceSpan(wf.start, wf.end, query),
  }
}

/**
 * Convert UTF-8 byte offsets to a line/column source span.
 *
 * `column` is a 1-based count of UTF-16 code units and `offset` is the
 * matching JavaScript string index. See {@link createUtf8OffsetMapper}.
 */
function byteSpanToSourceSpan(startByte: number, endByte: number, query: string): SourceSpan {
  const toPosition = createUtf8OffsetMapper(query)
  const start = toPosition(startByte)
  const end = toPosition(endByte)
  return {
    start: { line: start.line, column: start.column, offset: start.index },
    end: { line: end.line, column: end.column, offset: end.index },
  }
}
