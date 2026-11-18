import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createMessageConnection,
  FileChangeType,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-languageserver/node'

const serverPath = fileURLToPath(new URL('../../dist/server.js', import.meta.url))

interface PublishedDiagnostics {
  uri: string
  diagnostics: { code?: string | number; message: string }[]
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
  let published: PublishedDiagnostics[]
  let waiters: (() => void)[]

  const waitForDiagnostics = async (
    uri: string,
    predicate: (d: PublishedDiagnostics) => boolean
  ): Promise<PublishedDiagnostics> => {
    const deadline = Date.now() + 4_000
    for (;;) {
      const hit = published.filter((d) => d.uri === uri).findLast(predicate)
      if (hit) return hit
      if (Date.now() > deadline) throw new Error('Timed out waiting for diagnostics')
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
})
