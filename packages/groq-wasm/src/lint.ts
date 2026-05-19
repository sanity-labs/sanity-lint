/**
 * GROQ Linting via WASM
 *
 * Wraps the Rust groq-lint library compiled to WASM.
 */

import type { Finding, SourceLocation, SourceSpan } from '@sanity-labs/lint-core'
import {
  mapRuleId,
  mapSeverity,
  WasmError,
  type WasmFinding,
  type WasmLintConfig,
} from './types.js'
import { callLint } from './wasm-loader.js'

/**
 * Lint a GROQ query using the WASM-based linter
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
 * Convert byte offsets to line/column source span
 */
function byteSpanToSourceSpan(startByte: number, endByte: number, query: string): SourceSpan {
  return {
    start: byteOffsetToLocation(startByte, query),
    end: byteOffsetToLocation(endByte, query),
  }
}

/**
 * Convert byte offset to line/column location
 */
function byteOffsetToLocation(offset: number, query: string): SourceLocation {
  let line = 1
  let column = 1
  let currentOffset = 0

  for (const char of query) {
    if (currentOffset >= offset) {
      break
    }

    if (char === '\n') {
      line++
      column = 1
    } else {
      column++
    }

    currentOffset++
  }

  return { line, column, offset }
}
