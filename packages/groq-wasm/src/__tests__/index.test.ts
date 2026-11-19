import { describe, expect, it } from 'vitest'

// oxlint-disable-next-line import/no-namespace -- the test asserts on the module's full export list
import * as publicApi from '../index.js'
import {
  DEFAULT_WIDTH,
  format,
  isValidSyntax,
  lint,
  mapRuleId,
  mapSeverity,
  WasmError,
} from '../index.js'

describe('@sanity-labs/groq-wasm', () => {
  it('does not export lazy init helpers', () => {
    expect(publicApi).not.toHaveProperty('load')
    expect(publicApi).not.toHaveProperty('initWasm')
  })

  describe('lint', () => {
    it('should lint a valid query without findings', () => {
      const findings = lint('*[_type == "post"]')
      expect(Array.isArray(findings)).toBe(true)
    })

    it('should return findings array', () => {
      const findings = lint('*[_type == "post"]{ author-> }')
      expect(Array.isArray(findings)).toBe(true)
    })

    it('should handle empty query', () => {
      const findings = lint('')
      expect(findings).toEqual([])
    })

    it('should support config parameter', () => {
      const findings = lint('*[_type == "post"]', {
        rules: { join_in_filter: false },
      })
      expect(Array.isArray(findings)).toBe(true)
    })
  })

  describe('format', () => {
    it('should format a query', () => {
      const result = format('*[_type == "post"]')
      expect(typeof result).toBe('string')
    })

    it('should handle empty query', () => {
      const result = format('')
      expect(result).toBe('')
    })

    it('should handle whitespace-only query', () => {
      const result = format('   ')
      expect(result).toBe('   ')
    })

    it('should support custom width', () => {
      const result = format('*[_type == "post"]', { width: 40 })
      expect(typeof result).toBe('string')
    })

    it('should export DEFAULT_WIDTH', () => {
      expect(DEFAULT_WIDTH).toBe(80)
    })

    it('formats a document of only fn definitions, such as a shared functions file', () => {
      const functions = [
        '// Image helpers',
        '',
        'fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};',
        'fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};',
        'fn image::richText($blocks) = $blocks[]{',
        '  ...,',
        '  _type == "image" => {_key, _type, alt, caption, crop, hotspot, "asset": image::asset(asset)},',
        '  _type == "timeline" => {',
        '    ...,',
        '    items[]{',
        '      ...,',
        '      milestones[]{',
        '        ...,',
        '        "image": image::field(image)',
        '      }',
        '    }',
        '  }',
        '};',
        '',
      ].join('\n')
      expect(format(functions)).toBe(
        [
          '// Image helpers',
          'fn image::asset($asset) = $asset-> { url, metadata { lqip, dimensions } };',
          'fn image::field($image) = $image { crop, hotspot, "asset": image::asset(asset) };',
          'fn image::richText($blocks) = $blocks[] {',
          '  ...,',
          '  _type == "image" => {',
          '    _key,',
          '    _type,',
          '    alt,',
          '    caption,',
          '    crop,',
          '    hotspot,',
          '    "asset": image::asset(asset)',
          '  },',
          '  _type == "timeline" => {',
          '    ...,',
          '    items[] { ..., milestones[] { ..., "image": image::field(image) } }',
          '  }',
          '};',
        ].join('\n')
      )
      expect(format('fn a::b($x)=$x{a}; // the end')).toBe('fn a::b($x) = $x { a };\n// the end')
      expect(isValidSyntax(functions)).toBe(true)
    })

    it('still rejects definitions followed by an incomplete query, or not ended with ;', () => {
      for (const query of [
        'fn a::b($x) = $x{a}; *[',
        'fn a::b($x) = $x{a}; foo ||',
        'fn a::b($x) = $x{a}',
        '// only a comment',
      ]) {
        expect(() => format(query), query).toThrow(WasmError)
      }
    })
  })

  describe('isValidSyntax', () => {
    it('should return true for valid query', () => {
      expect(isValidSyntax('*[_type == "post"]')).toBe(true)
    })

    it('should return true for empty query', () => {
      expect(isValidSyntax('')).toBe(true)
    })
  })

  describe('type mappings', () => {
    it('should map Rust rule IDs to kebab-case', () => {
      expect(mapRuleId('join_in_filter')).toBe('join-in-filter')
      expect(mapRuleId('deep_pagination')).toBe('deep-pagination')
      expect(mapRuleId('very_large_query')).toBe('very-large-query')
      expect(mapRuleId('some_unknown_rule')).toBe('some-unknown-rule')
    })

    it('should map WASM severity to standard severity', () => {
      expect(mapSeverity('high')).toBe('error')
      expect(mapSeverity('medium')).toBe('warning')
      expect(mapSeverity('low')).toBe('info')
    })
  })

  describe('WasmError', () => {
    it('should create error with code', () => {
      const error = new WasmError('test message', 'WASM_ERROR')
      expect(error.message).toBe('test message')
      expect(error.code).toBe('WASM_ERROR')
      expect(error.name).toBe('WasmError')
    })

    it('should be instanceof Error', () => {
      const error = new WasmError('test', 'WASM_ERROR')
      expect(error instanceof Error).toBe(true)
      expect(error instanceof WasmError).toBe(true)
    })
  })
})
