/**
 * Conversion from groq-parser's UTF-8 byte offsets to JavaScript string
 * coordinates.
 *
 * wasm-bindgen passes the query to Rust with `TextEncoder`, so parser spans
 * are byte offsets into the query's UTF-8 encoding. JavaScript strings are
 * UTF-16, so those offsets stop matching string indices once the query
 * contains non-ASCII text.
 */

/** A position in a JavaScript string. */
export interface TextPosition {
  /** 0-based UTF-16 code unit index. */
  index: number
  /** 1-based line. Advances on `\n`. */
  line: number
  /** 1-based column, counted in UTF-16 code units. */
  column: number
}

/**
 * Create a function that maps UTF-8 byte offsets in `text` to
 * {@link TextPosition}s.
 *
 * The mapper resumes from the previous result, so calling it with ascending
 * offsets walks `text` once. A smaller offset restarts from the beginning.
 * An offset inside a code point resolves to the start of that code point, and
 * an offset past the end resolves to the end of `text`.
 */
export function createUtf8OffsetMapper(text: string): (byteOffset: number) => TextPosition {
  let index = 0
  let bytes = 0
  let line = 1
  let column = 1

  return (byteOffset) => {
    if (byteOffset < bytes) {
      index = 0
      bytes = 0
      line = 1
      column = 1
    }

    while (index < text.length && bytes < byteOffset) {
      const codePoint = text.codePointAt(index) ?? 0
      const byteWidth = utf8ByteLength(codePoint)
      if (bytes + byteWidth > byteOffset) {
        break
      }

      const utf16Width = codePoint > 0xffff ? 2 : 1
      bytes += byteWidth
      index += utf16Width

      if (codePoint === 0x0a) {
        line += 1
        column = 1
      } else {
        column += utf16Width
      }
    }

    return { index, line, column }
  }
}

/**
 * UTF-8 byte length of one code point, matching `TextEncoder`.
 *
 * Unpaired surrogates fall in the 3-byte range. `TextEncoder` replaces each
 * of them with U+FFFD, which is also 3 bytes.
 */
function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1
  if (codePoint <= 0x7ff) return 2
  if (codePoint <= 0xffff) return 3
  return 4
}
