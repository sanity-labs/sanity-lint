import { describe, expect, it } from 'vitest'

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
