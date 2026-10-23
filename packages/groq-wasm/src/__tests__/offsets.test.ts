import { describe, expect, it } from 'vitest'

import { createUtf8OffsetMapper } from '../offsets.js'

describe('createUtf8OffsetMapper', () => {
  it('maps byte offsets past multi-byte characters and newlines', () => {
    const toPosition = createUtf8OffsetMapper('é\n😀x')
    expect(toPosition(0)).toEqual({ index: 0, line: 1, column: 1 })
    expect(toPosition(2)).toEqual({ index: 1, line: 1, column: 2 })
    expect(toPosition(3)).toEqual({ index: 2, line: 2, column: 1 })
    expect(toPosition(7)).toEqual({ index: 4, line: 2, column: 3 })
    expect(toPosition(8)).toEqual({ index: 5, line: 2, column: 4 })
  })

  it('restarts when an offset is smaller than the previous one', () => {
    const toPosition = createUtf8OffsetMapper('aé b')
    expect(toPosition(4)).toEqual({ index: 3, line: 1, column: 4 })
    expect(toPosition(1)).toEqual({ index: 1, line: 1, column: 2 })
  })

  it('resolves an offset inside a code point to the start of that code point', () => {
    expect(createUtf8OffsetMapper('a😀b')(3)).toEqual({ index: 1, line: 1, column: 2 })
  })

  it('clamps an offset past the end to the end of the text', () => {
    expect(createUtf8OffsetMapper('ab')(10)).toEqual({ index: 2, line: 1, column: 3 })
  })

  it('counts a lone surrogate as the 3 bytes TextEncoder writes for it', () => {
    const text = '\ud800x'
    expect(new TextEncoder().encode(text.slice(0, 1)).length).toBe(3)
    expect(createUtf8OffsetMapper(text)(3)).toEqual({ index: 1, line: 1, column: 2 })
  })
})
