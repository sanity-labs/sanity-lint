import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createMessageConnection,
  FileChangeType,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver/node'
import type { MessageConnection } from 'vscode-languageserver/node'

const serverPath = fileURLToPath(new URL('../../dist/server.js', import.meta.url))

interface PublishedDiagnostics {
  uri: string
  diagnostics: Array<{ code?: string | number; message: string }>
}

const schemaWith = (...typeNames: Array<string>) =>
  typeNames.map((typeName) => ({
    type: 'document',
    name: typeName,
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: typeName } },
    },
  }))

describe.skipIf(!existsSync(serverPath))(
  'language server with groq-content-mapper settings',
  () => {
    let child: ChildProcessWithoutNullStreams
    let connection: MessageConnection
    let workspace: string
    let published: Array<PublishedDiagnostics>
    let registeredGlobs: Array<string>

    const write = (path: string, content: string) => {
      const file = join(workspace, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
      return file
    }

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
        await new Promise((resolve) => {
          setTimeout(resolve, 50)
        })
      }
    }

    const open = async (path: string, languageId: string, text: string) => {
      const uri = pathToFileURL(join(workspace, path)).toString()
      await connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      })
      return uri
    }

    beforeAll(async () => {
      workspace = mkdtempSync(join(tmpdir(), 'groq-lsp-mapper-server-'))
      write(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {},
          contentMappers: [
            {
              package: '@sanity-labs/groq-content-mapper',
              extensions: ['.groq'],
              options: { schema: './sanity/extract.json', functions: ['groq/*.groq'] },
            },
          ],
        })
      )
      write('sanity/extract.json', JSON.stringify(schemaWith('post')))
      write(
        'groq/image.groq',
        'fn image::asset($asset) = $asset->{url};\nfn image::field($image) = $image{crop, "asset": image::asset(asset)};\n'
      )

      published = []
      registeredGlobs = []
      child = spawn(process.execPath, [serverPath, '--stdio'], { stdio: 'pipe' })
      connection = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin)
      )
      connection.onNotification(
        'textDocument/publishDiagnostics',
        (params: PublishedDiagnostics) => {
          published.push(params)
        }
      )
      connection.onRequest(
        'client/registerCapability',
        (params: {
          registrations: Array<{ registerOptions?: { watchers?: Array<{ globPattern: string }> } }>
        }) => {
          for (const registration of params.registrations) {
            registeredGlobs.push(
              ...(registration.registerOptions?.watchers ?? []).map((w) => w.globPattern)
            )
          }
          return null
        }
      )
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

    it('lints a .groq file with the shared functions and the schema the tsconfig names', async () => {
      const uri = await open(
        'queries/post.groq',
        'groq',
        '*[_type == "article"][0]{title, "image": image::field(mainImage)}\n'
      )
      const result = await waitForDiagnostics(uri, (d) => d.diagnostics.length > 0)
      expect(result.diagnostics.map((d) => d.code)).toEqual(['invalid-type-filter'])
      expect(registeredGlobs).toEqual(
        expect.arrayContaining(['**/tsconfig.json', '**/extract.json'])
      )
    })

    it('uses the mapper schema for embedded queries, but not the functions', async () => {
      const uri = await open(
        'src/query.ts',
        'typescript',
        'const a = groq`*[_type == "article"]`\nconst b = groq`*[0]{"i": image::field(x)}`'
      )
      const result = await waitForDiagnostics(uri, (d) => d.diagnostics.length >= 2)
      expect(result.diagnostics.map((d) => d.code ?? d.message.split(':')[0])).toEqual([
        'invalid-type-filter',
        'Parse error',
      ])
    })

    it('goes to the shared definition of a function a query calls', async () => {
      const text = '*[_type == "post"][0]{"image": image::field(mainImage)}\n'
      const uri = await open('queries/definition.groq', 'groq', text)
      const links: Array<{
        targetUri: string
        targetSelectionRange: { start: { line: number; character: number } }
      }> = await connection.sendRequest('textDocument/definition', {
        textDocument: { uri },
        position: { line: 0, character: text.indexOf('field') },
      })
      expect(links).toHaveLength(1)
      expect(links[0]?.targetUri).toBe(pathToFileURL(join(workspace, 'groq/image.groq')).toString())
      expect(links[0]?.targetSelectionRange.start).toEqual({ line: 1, character: 3 })
    })

    it('finds the calls of a shared function in the functions file and in queries', async () => {
      write('queries/card.groq', '*[_type == "post"]{"a": image::asset(cover)}\n')
      const functionsText =
        'fn image::asset($asset) = $asset->{url};\nfn image::field($image) = $image{crop, "asset": image::asset(asset)};\n'
      const uri = await open('groq/image.groq', 'groq', functionsText)
      const locations: Array<{ uri: string; range: { start: { line: number } } }> =
        await connection.sendRequest('textDocument/references', {
          textDocument: { uri },
          position: { line: 0, character: 'fn image::as'.length },
          context: { includeDeclaration: false },
        })
      expect(
        locations.map((location) => [
          location.uri.slice(location.uri.lastIndexOf('/') + 1),
          location.range.start.line,
        ])
      ).toEqual([
        ['image.groq', 1],
        ['card.groq', 0],
      ])
    })

    it('re-lints when the schema the tsconfig names changes', async () => {
      const uri = pathToFileURL(join(workspace, 'queries/post.groq')).toString()
      const before = await waitForDiagnostics(uri, (d) => d.diagnostics.length > 0)
      const schemaPath = write('sanity/extract.json', JSON.stringify(schemaWith('post', 'article')))
      await connection.sendNotification('workspace/didChangeWatchedFiles', {
        changes: [{ uri: pathToFileURL(schemaPath).toString(), type: FileChangeType.Changed }],
      })
      const after = await waitForDiagnostics(uri, (d) => d !== before && d.diagnostics.length === 0)
      expect(after.diagnostics).toEqual([])
    })
  }
)
