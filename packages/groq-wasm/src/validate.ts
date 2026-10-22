/**
 * GROQ syntax validation via WASM.
 *
 * Wraps groq-parser's structured parse errors. The parser reports UTF-8 byte
 * offsets; this module converts them to UTF-16 code unit indices.
 */

import { createUtf8OffsetMapper } from './offsets.js'
import { WasmError, type ValidateError, type ValidateResult } from './types.js'
import { callValidate } from './wasm-loader.js'

/**
 * Parse a GROQ query.
 *
 * Returns `{ok: true}` when the query parses. Syntax errors are returned as
 * `{ok: false, error}` and are not thrown. `lint` and `format` still throw
 * {@link WasmError} on invalid syntax; this function does not change that.
 *
 * `error.start` and `error.end` are 0-based UTF-16 code unit indices into
 * `query` (`end` is exclusive), which is what JavaScript strings and editors
 * such as Vision use. groq-parser's `ParseError` positions are UTF-8 byte
 * offsets (`Position.start` / `Position.end` in groq-parser-rs). An empty or
 * whitespace-only query is a syntax error (`"no query"`) at offset 0, unlike
 * `lint('')` and `format('')`, which treat it as nothing to do.
 *
 * `line` / `column` locate `start`, and `endLine` / `endColumn` locate `end`.
 * They are 1-based. Columns count UTF-16 code units, matching `SourceLocation`
 * on lint findings.
 *
 * Parameter references (`$name`) are accepted. This is a syntax check and does
 * not require the parameters to be declared.
 *
 * @example
 * ```typescript
 * import {validate} from '@sanity-labs/groq-wasm'
 *
 * validate('*[_type == "post"]')
 * // {ok: true}
 *
 * validate('*["é" == ]')
 * // {
 * //   ok: false,
 * //   error: {
 * //     message: 'unexpected token "]", expected expression',
 * //     start: 9,
 * //     end: 10,
 * //     line: 1,
 * //     column: 10,
 * //     endLine: 1,
 * //     endColumn: 11,
 * //   },
 * // }
 * ```
 */
export function validate(query: string): ValidateResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(callValidate(query))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new WasmError(`Validate failed: ${message}`, 'WASM_ERROR')
  }

  const payload = readValidatePayload(parsed)
  switch (payload.ok) {
    case true:
      return { ok: true }
    case false:
      return { ok: false, error: toValidateError(query, payload) }
    default: {
      const unexpected: never = payload
      throw new WasmError(`Unexpected validate result: ${JSON.stringify(unexpected)}`, 'WASM_ERROR')
    }
  }
}

interface WasmValidateFailure {
  ok: false
  message: string
  start: number
  end: number
}

type WasmValidatePayload = { ok: true } | WasmValidateFailure

function readValidatePayload(value: unknown): WasmValidatePayload {
  if (!isRecord(value)) {
    throw new WasmError('Validate returned an invalid payload', 'WASM_ERROR')
  }

  const ok = value['ok']
  if (ok === true) {
    return { ok: true }
  }

  const message = value['message']
  const start = value['start']
  const end = value['end']
  if (
    ok === false &&
    typeof message === 'string' &&
    typeof start === 'number' &&
    typeof end === 'number'
  ) {
    return { ok: false, message, start, end }
  }

  throw new WasmError('Validate returned an invalid payload', 'WASM_ERROR')
}

function toValidateError(query: string, failure: WasmValidateFailure): ValidateError {
  const toPosition = createUtf8OffsetMapper(query)
  const start = toPosition(Math.max(0, failure.start))
  const end = toPosition(Math.max(failure.start, failure.end))
  return {
    message: failure.message,
    start: start.index,
    end: end.index,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
