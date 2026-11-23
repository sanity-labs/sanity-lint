import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format as groqWasmFormat } from '@sanity-labs/groq-wasm'
import {
  createMessageConnection,
  FileChangeType,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver/node'
import type { MessageConnection, TextEdit } from 'vscode-languageserver/node'

const serverPath = fileURLToPath(new URL('../../dist/server.js', import.meta.url))

interface PublishedDiagnostics {
  uri: string
  diagnostics: Array<{ code?: string | number; message: string }>
}

const schemaWith = (typeName: string) => [
  {
    type: 'document',
    name: typeName,
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: typeName } },
    },
  },
]

describe.skipIf(!existsSync(serverPath))('language server (stdio)', () => {
  let child: ChildProcessWithoutNullStreams
  let connection: MessageConnection
  let workspace: string
  let published: Array<PublishedDiagnostics>
  let waiters: Array<() => void>

  const waitForDiagnostics = async (
    uri: string,
    predicate: (d: PublishedDiagnostics) => boolean
  ): Promise<PublishedDiagnostics> => {
    const deadline = Date.now() + 4000
    for (;;) {
      const hit = published.filter((d) => d.uri === uri && predicate(d)).at(-1)
      if (hit) {
        return hit
      }
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for diagnostics')
      }
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 200)
      })
    }
  }

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'groq-lsp-server-'))

    published = []
    waiters = []
    child = spawn(process.execPath, [serverPath, '--stdio'], { stdio: 'pipe' })
    connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin)
    )
    connection.onNotification('textDocument/publishDiagnostics', (params: PublishedDiagnostics) => {
      published.push(params)
      waiters.splice(0).forEach((resolve) => resolve())
    })
    connection.onRequest('client/registerCapability', () => null)
    connection.listen()

    await connection.sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).toString(),
      workspaceFolders: [{ uri: pathToFileURL(workspace).toString(), name: 'ws' }],
      capabilities: { workspace: { didChangeWatchedFiles: { dynamicRegistration: true } } },
    })
    await connection.sendNotification('initialized', {})
  })

  afterAll(() => {
    connection?.dispose()
    child?.kill()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('loads a schema created after startup and re-lints open documents on a watched-file event', async () => {
    const uri = pathToFileURL(join(workspace, 'query.ts')).toString()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: 'const q = groq`*[_type == "article"]`',
      },
    })

    const before = await waitForDiagnostics(uri, () => true)
    expect(before.diagnostics).toEqual([])

    const schemaPath = join(workspace, 'schema.json')
    writeFileSync(schemaPath, JSON.stringify(schemaWith('post')))
    await connection.sendNotification('workspace/didChangeWatchedFiles', {
      changes: [{ uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Created }],
    })

    const after = await waitForDiagnostics(uri, (d) =>
      d.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-type-filter')
    )
    expect(after.diagnostics).toHaveLength(1)

    writeFileSync(schemaPath, JSON.stringify(schemaWith('article')))
    await connection.sendNotification('workspace/didChangeWatchedFiles', {
      changes: [{ uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Changed }],
    })

    const reloaded = await waitForDiagnostics(uri, (d) => d !== after && d.diagnostics.length === 0)
    expect(reloaded.diagnostics).toEqual([])
  })

  it('lints defineQuery and /* groq */ queries in documents', async () => {
    const uri = pathToFileURL(join(workspace, 'queries.ts')).toString()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: 'const a = defineQuery(`*[_type == "missing-a"]`)\nconst b = /* groq */ `*[_type == "missing-b"]`',
      },
    })

    const result = await waitForDiagnostics(uri, (d) => d.diagnostics.length >= 2)
    expect(result.diagnostics).toHaveLength(2)
  })

  it('lints queries with their fragments inlined, and again when a fragment changes', async () => {
    const fragmentPath = join(workspace, 'fragments.ts')
    writeFileSync(fragmentPath, 'export const author = defineQuery(`{ name }`)')
    const uri = pathToFileURL(join(workspace, 'article.ts')).toString()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: [
          "import {author} from './fragments'",
          'const query = defineQuery(`*[_type == "article"]{ author->${author} }`)',
        ].join('\n'),
      },
    })
    const clean = await waitForDiagnostics(uri, () => true)
    expect(clean.diagnostics).toEqual([])

    const fragmentUri = pathToFileURL(fragmentPath).toString()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: fragmentUri,
        languageId: 'typescript',
        version: 1,
        text: 'export const author = defineQuery(`{ name }`)',
      },
    })
    await connection.sendNotification('textDocument/didChange', {
      textDocument: { uri: fragmentUri, version: 2 },
      contentChanges: [{ text: 'export const author = defineQuery(`{ name,, }`)' }],
    })
    const broken = await waitForDiagnostics(uri, (d) => d.diagnostics.length > 0)
    expect(broken.diagnostics[0]?.message).toContain('Parse error')
  })

  it('formats with groq-wasm, indented per the tab size and spaces or tabs', async () => {
    const query =
      '*[_type == "post"]{title, "author": author->{name, "slug": slug.current}, "long": select(a == 1 => "one one one one one one", a == 2 => "two two two two two", "x")}'
    const uri = pathToFileURL(join(workspace, 'format.groq')).toString()
    await connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'groq', version: 1, text: `${query}\n` },
    })

    const newText = async (options: { tabSize: number; insertSpaces: boolean }) => {
      const edits: Array<TextEdit> = await connection.sendRequest('textDocument/formatting', {
        textDocument: { uri },
        options,
      })
      return edits.map((edit) => edit.newText)
    }
    const expected = groqWasmFormat(query).trimEnd()
    expect(expected).toContain('\n    a == 2')

    expect(await newText({ tabSize: 2, insertSpaces: true })).toEqual([expected])
    expect(await newText({ tabSize: 4, insertSpaces: true })).toEqual([
      expected.replaceAll(/^(?: {2})+/gm, (indent) => '    '.repeat(indent.length / 2)),
    ])
    expect(await newText({ tabSize: 4, insertSpaces: false })).toEqual([
      expected.replaceAll(/^(?: {2})+/gm, (indent) => '\t'.repeat(indent.length / 2)),
    ])
  })
})
