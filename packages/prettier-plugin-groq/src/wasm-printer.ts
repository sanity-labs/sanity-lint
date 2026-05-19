/**
 * WASM-based GROQ printer for Prettier.
 *
 * The WASM module from @sanity-labs/groq-wasm is initialized synchronously
 * at import time, so this printer can be used immediately by Prettier
 * without any async bootstrap.
 */

import { format as wasmFormat } from '@sanity-labs/groq-wasm'
import type { Printer } from 'prettier'

export const groqPrinter: Printer<unknown> = {
  print(_path, options) {
    const source = options.originalText ?? ''
    const width = options.printWidth || 80
    return wasmFormat(source, { width })
  },
}
