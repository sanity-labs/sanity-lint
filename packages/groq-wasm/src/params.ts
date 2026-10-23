/**
 * GROQ query parameter extraction via WASM.
 *
 * Wraps groq-parser's `ParseResult::referenced_params`. The parser reports
 * UTF-8 byte offsets; this module converts them to UTF-16 code unit indices.
 */

import { createUtf8OffsetMapper } from './offsets.js'
import { WasmError, type QueryParam, type WasmParamReference } from './types.js'
import { callExtractParams } from './wasm-loader.js'

/**
 * List the query parameters (`$name`) a GROQ query references.
 *
 * Returns one entry per distinct name, in order of first reference. Each entry
 * lists every reference to that name in source order. Names do not include
 * the `$`, so they match the keys of the params object passed to a client.
 *
 * Parameters bound by a custom function (`fn ns::f($p) = ...`) are local to
 * that function's body and are not reported from inside it. `$name` text
 * inside string literals and comments is not a reference.
 *
 * Reference `start` / `end` are 0-based UTF-16 code unit indices into
 * `query` (`end` is exclusive), so `query.slice(start, end)` is `"$name"`.
 *
 * An empty or whitespace-only query returns `[]`, like `lint('')`.
 *
 * @param query - The GROQ query string
 * @returns Referenced parameters, in order of first reference
 * @throws {WasmError} With code `PARSE_ERROR` if the query does not parse
 *
 * @example
 * ```typescript
 * import {extractParams} from '@sanity-labs/groq-wasm'
 *
 * extractParams('*[_type == $type][0...$limit]').map((param) => param.name)
 * // ['type', 'limit']
 * ```
 */
export function extractParams(query: string): QueryParam[] {
  if (!query.trim()) {
    return []
  }

  let resultJson: string
  try {
    resultJson = callExtractParams(query)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('parse') || message.includes('Parse')) {
      throw new WasmError(`Failed to parse query: ${message}`, 'PARSE_ERROR')
    }

    throw new WasmError(`Extract params failed: ${message}`, 'WASM_ERROR')
  }

  const wasmReferences: WasmParamReference[] = JSON.parse(resultJson)
  const toPosition = createUtf8OffsetMapper(query)
  const params = new Map<string, QueryParam>()

  for (const reference of wasmReferences) {
    const start = toPosition(reference.start)
    const end = toPosition(reference.end)

    let param = params.get(reference.name)
    if (!param) {
      param = { name: reference.name, references: [] }
      params.set(reference.name, param)
    }

    param.references.push({
      start: start.index,
      end: end.index,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
    })
  }

  return [...params.values()]
}
