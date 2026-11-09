import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wasmBytes = readFileSync(new URL('../../wasm/groq_wasm_bg.wasm', import.meta.url))
const lazyBundle = new URL('../../dist/index.lazy.js', import.meta.url)
const hasLazyBundle = existsSync(lazyBundle)
const wasmArrayBuffer = new Uint8Array(wasmBytes).buffer

async function importLazy() {
  return import('../index.lazy.js')
}

function wasmResponse(bytes: Uint8Array = wasmBytes, status = 200, statusText = 'OK'): Response {
  return new Response(bytes, { status, statusText })
}

describe('@sanity-labs/groq-wasm/lazy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('does not fetch or initialize on import', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const lazy = await importLazy()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(lazy.lint('')).toEqual([])
    expect(lazy.format('   ')).toBe('   ')
    expect(lazy.extractParams(' \n')).toEqual([])
    expectNotInitialized(() => lazy.lint('*[_type == "post"][0...10]'))
    expectNotInitialized(() => lazy.format('*[_type == "post"][0...10]'))
    expectNotInitialized(() => lazy.validate('*[_type == "post"][0...10]'))
    expectNotInitialized(() => lazy.extractParams('*[_type == $type][0...10]'))
    expectNotInitialized(() => lazy.isValidSyntax('*[_type == "post"][0...10]'))
  })

  it('load() initializes once and dedupes concurrent calls', async () => {
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches += 1
      await delay(20)
      return wasmResponse()
    })

    const { extractParams, format, lint, load, validate } = await importLazy()
    await Promise.all([load(), load(), load()])
    expect(fetches).toBe(1)

    await load()
    expect(fetches).toBe(1)

    const findings = lint('*[author->name == "Bob"][0...10]')
    expect(findings.map((finding) => finding.ruleId)).toContain('join-in-filter')
    expect(format('*[_type=="post"][0...10]')).toContain('_type')
    expect(validate('*[_type == "post"][0...10]')).toEqual({ ok: true })
    expect(extractParams('*[_type == $type][0...10]')[0]?.name).toBe('type')
  })

  it('retries load() after a failed fetch', async () => {
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches += 1
      if (fetches === 1) return wasmResponse(new Uint8Array(), 503, 'unavailable')
      return wasmResponse()
    })

    const { lint, load } = await importLazy()
    await expect(load()).rejects.toMatchObject({
      code: 'WASM_ERROR',
      message: expect.stringContaining('503'),
    })
    expectNotInitialized(() => lint('*[_type == "post"][0...10]'))

    await load()
    expect(fetches).toBe(2)
    expect(lint('*[_type == "post"][0...10]')).toEqual([])
  })

  it('retries load() after a network error', async () => {
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches += 1
      if (fetches === 1) throw new Error('network down')
      return wasmResponse()
    })

    const { load, validate } = await importLazy()
    await expect(load()).rejects.toMatchObject({
      code: 'WASM_ERROR',
      message: expect.stringContaining('network down'),
    })
    await load()
    expect(validate('*[')).toMatchObject({ ok: false })
  })

  it('initWasm(bytes) initializes without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { format, initWasm, load } = await importLazy()
    initWasm(wasmBytes)
    initWasm(wasmArrayBuffer)
    await load()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(format('*[_type=="post"]{title}')).toEqual(expect.any(String))
  })

  it('initWasm accepts a WebAssembly.Module', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { initWasm, validate } = await importLazy()
    initWasm(new WebAssembly.Module(wasmBytes))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(validate('*[').ok).toBe(false)
  })

  it('initWasm accepts a Response and ignores a later failed Response', async () => {
    const { initWasm, lint } = await importLazy()
    await initWasm(wasmResponse())
    await initWasm(wasmResponse(new Uint8Array(), 500, 'nope'))
    expect(lint('*[_type == "post"][0...10]')).toEqual([])
  })

  it('initWasm rejects invalid bytes and a failed Response', async () => {
    const { initWasm, lint } = await importLazy()

    expect(() => initWasm(new Uint8Array([0, 1, 2, 3]))).toThrow(/magic word/)
    expectNotInitialized(() => lint('*[_type == "post"][0...10]'))

    const missing = wasmResponse(wasmBytes, 404, 'missing')
    Object.defineProperty(missing, 'url', { value: 'https://cdn.example/groq.wasm' })
    await expect(initWasm(missing)).rejects.toMatchObject({
      name: 'WasmError',
      code: 'WASM_ERROR',
      message: expect.stringContaining('https://cdn.example/groq.wasm'),
    })
    expectNotInitialized(() => lint('*[_type == "post"][0...10]'))
  })

  it('keeps load and initWasm off the package exports map for the default entry', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    )
    expect(manifest.exports['.']).toEqual({
      types: './dist/index.d.ts',
      browser: './dist/index.browser.js',
      default: './dist/index.js',
    })
    expect(manifest.exports['./lazy']).toEqual({
      types: './dist/index.lazy.d.ts',
      import: './dist/index.lazy.js',
      default: './dist/index.lazy.js',
    })
    expect(manifest.exports['./wasm']).toBe('./wasm/groq_wasm_bg.wasm')
  })

  // CI builds before testing. A local `pnpm test` without `pnpm build` has no dist yet.
  it.skipIf(!hasLazyBundle)('built lazy entry has no top-level await', () => {
    const files = readModuleGraph(lazyBundle)
    expect(files.length).toBeGreaterThan(1)

    for (const file of files) {
      expect(hasTopLevelAwait(file.code), file.path).toBe(false)
    }

    const lazySource = files[0]?.code ?? ''
    expect(lazySource).toContain('../wasm/groq_wasm_bg.wasm')
    expect(lazySource).toMatch(/\bload\b/)

    const browserUrl = new URL('../../dist/index.browser.js', import.meta.url)
    const browser = readFileSync(browserUrl, 'utf8')
    expect(hasTopLevelAwait(browser)).toBe(true)
    const browserEntryPath = fileURLToPath(browserUrl)
    const shared = readModuleGraph(browserUrl).filter((file) => file.path !== browserEntryPath)
    for (const file of shared) {
      expect(hasTopLevelAwait(file.code), file.path).toBe(false)
    }
  })

  it.skipIf(!hasLazyBundle)(
    'built lazy entry throws before init and works after initWasm',
    async () => {
      vi.resetModules()
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const built = (await import(lazyBundle.href)) as typeof import('../index.lazy.js')
      expect(fetchMock).not.toHaveBeenCalled()
      expectNotInitialized(() => built.lint('*[_type == "post"][0...10]'))
      expectNotInitialized(() => built.format('*[_type == "post"][0...10]'))

      built.initWasm(wasmBytes)
      expect(built.validate('*[_type == "post"][0...10]')).toEqual({ ok: true })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )
})

function expectNotInitialized(call: () => unknown): void {
  try {
    call()
  } catch (error) {
    expect(error).toMatchObject({
      name: 'WasmError',
      code: 'NOT_INITIALIZED',
    })
    if (!(error instanceof Error)) {
      expect.fail('expected a WasmError')
    }
    expect(error.message).toContain('load()')
    expect(error.message).toContain('initWasm()')
    return
  }
  expect.fail('expected NOT_INITIALIZED')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function hasTopLevelAwait(code: string): boolean {
  const source = ts.createSourceFile(
    'module.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  )
  let found = false

  const visit = (node: ts.Node, insideFunction: boolean): void => {
    if (found) return
    const topLevelAwait =
      !insideFunction &&
      (ts.isAwaitExpression(node) ||
        (ts.isForOfStatement(node) && node.awaitModifier !== undefined))
    if (topLevelAwait) {
      found = true
      return
    }

    const nextInside = insideFunction || ts.isFunctionLike(node)
    ts.forEachChild(node, (child) => {
      visit(child, nextInside)
    })
  }

  visit(source, false)
  return found
}

function readModuleGraph(entry: URL): { path: string; code: string }[] {
  const seen = new Set<string>()
  const files: { path: string; code: string }[] = []

  const visit = (url: URL): void => {
    const path = fileURLToPath(url)
    if (seen.has(path)) return
    seen.add(path)
    const code = readFileSync(path, 'utf8')
    files.push({ path, code })
    const base = new URL('./', url)
    for (const match of code.matchAll(/from\s*["'](\.[^"']+)["']/g)) {
      const specifier = match[1]
      if (!specifier) continue
      visit(new URL(specifier, base))
    }
  }

  visit(entry)
  return files
}
