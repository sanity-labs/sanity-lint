/**
 * GROQ Language Server Client
 *
 * Provides GROQ language support through the GROQ Language Server:
 * - Diagnostics (linting)
 * - Hover information
 * - Auto-completion
 * - Formatting
 */

import * as path from 'path'
import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node'

let client: LanguageClient | undefined
let outputChannel: vscode.OutputChannel | undefined

/**
 * Initialize the GROQ LSP client
 */
export async function initializeLspClient(
  context: vscode.ExtensionContext,
  sharedOutputChannel?: vscode.OutputChannel
): Promise<boolean> {
  // Check if LSP is enabled
  const config = vscode.workspace.getConfiguration('groq')
  if (!config.get<boolean>('enable', true)) {
    return false
  }

  // Use shared output channel or create one
  outputChannel = sharedOutputChannel || vscode.window.createOutputChannel('GROQ LSP')
  if (!sharedOutputChannel) {
    context.subscriptions.push(outputChannel)
  }

  // Start the language client
  const started = await startClient(context)
  if (!started) {
    return false
  }

  // Register LSP-specific commands
  registerLspCommands(context)

  outputChannel.appendLine('GROQ LSP client initialized')
  return true
}

/**
 * Stop the LSP client
 */
export async function stopLspClient(): Promise<void> {
  if (client) {
    await client.stop()
    client = undefined
  }
}

/**
 * Check if the LSP client is running
 */
export function isLspClientRunning(): boolean {
  return client !== undefined
}

/**
 * Get the output channel (for logging)
 */
export function getLspOutputChannel(): vscode.OutputChannel | undefined {
  return outputChannel
}

/**
 * Starts the language client
 */
async function startClient(context: vscode.ExtensionContext): Promise<boolean> {
  // Find the server module
  const serverModule = await findServerModule(context)
  if (!serverModule) {
    outputChannel?.appendLine('Could not find GROQ language server module')
    // Don't show error - LSP is optional, query execution can work without it
    return false
  }

  outputChannel?.appendLine(`Using server module: ${serverModule}`)

  // Server options
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  }

  // Get configuration
  const config = vscode.workspace.getConfiguration('groq')
  const traceServer = config.get<string>('trace.server', 'off')

  // Client options
  const clientOptions: LanguageClientOptions = {
    // Documents to activate on
    documentSelector: [
      { scheme: 'file', language: 'groq' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    synchronize: {
      // Notify server about file changes to schema files
      fileEvents: vscode.workspace.createFileSystemWatcher('**/schema.json'),
    },
    initializationOptions: {
      schemaPath: config.get<string>('schemaPath'),
      maxDiagnostics: config.get<number>('maxDiagnostics', 100),
      enableFormatting: config.get<boolean>('enableFormatting', true),
    },
  }

  // Add output channel if available
  if (outputChannel) {
    clientOptions.outputChannel = outputChannel
    clientOptions.traceOutputChannel = outputChannel
  }

  // Create the client
  client = new LanguageClient('groq', 'GROQ Language Server', serverOptions, clientOptions)

  // Set trace level
  if (traceServer !== 'off') {
    client.setTrace(traceServer === 'verbose' ? 2 : 1)
  }

  try {
    // Start the client and wait for it to be ready
    await client.start()
    outputChannel?.appendLine('GROQ Language Server started')

    // Register disposable for cleanup
    context.subscriptions.push({
      dispose: () => client?.stop(),
    })

    return true
  } catch (error) {
    outputChannel?.appendLine(`Failed to start GROQ Language Server: ${error}`)
    return false
  }
}

/**
 * Find the server module path
 */
async function findServerModule(context: vscode.ExtensionContext): Promise<string | undefined> {
  outputChannel?.appendLine('Looking for GROQ language server...')

  // 1. For development: try sibling package in monorepo FIRST
  const devServer = context.asAbsolutePath(path.join('..', 'groq-lsp', 'dist', 'server.js'))
  outputChannel?.appendLine(`Checking dev server: ${devServer}`)
  if (await fileExists(devServer)) {
    outputChannel?.appendLine('Found dev server in monorepo')
    return devServer
  }

  // 2. Try bundled server (when extension is packaged)
  const bundledServer = context.asAbsolutePath(path.join('server', 'dist', 'server.js'))
  outputChannel?.appendLine(`Checking bundled server: ${bundledServer}`)
  if (await fileExists(bundledServer)) {
    outputChannel?.appendLine('Found bundled server')
    return bundledServer
  }

  // 3. Try workspace node_modules
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspaceRoot = workspaceFolders[0]?.uri.fsPath
    if (workspaceRoot) {
      const workspaceServer = path.join(
        workspaceRoot,
        'node_modules',
        '@sanity',
        'groq-lsp',
        'dist',
        'server.js'
      )
      outputChannel?.appendLine(`Checking workspace node_modules: ${workspaceServer}`)
      if (await fileExists(workspaceServer)) {
        outputChannel?.appendLine('Found server in workspace node_modules')
        return workspaceServer
      }
    }
  }

  outputChannel?.appendLine('No server found')
  return undefined
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const fs = await import('fs/promises')
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Register LSP-specific commands
 */
function registerLspCommands(context: vscode.ExtensionContext): void {
  // Restart server command
  context.subscriptions.push(
    vscode.commands.registerCommand('groq.restartServer', async () => {
      outputChannel?.appendLine('Restarting GROQ Language Server...')

      if (client) {
        await client.stop()
        client = undefined
      }

      const started = await startClient(context)
      if (started) {
        vscode.window.showInformationMessage('GROQ Language Server restarted')
      } else {
        vscode.window.showWarningMessage('Failed to restart GROQ Language Server')
      }
    })
  )

  // Show output command
  context.subscriptions.push(
    vscode.commands.registerCommand('groq.showOutput', () => {
      outputChannel?.show()
    })
  )
}
