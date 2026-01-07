/**
 * Build config for bundling the LSP server for the VS Code extension.
 * This creates a self-contained server.js with all dependencies bundled.
 */
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['../groq-lsp/src/server.ts'],
  format: ['cjs'], // VS Code extension servers should be CJS
  outDir: 'server/dist',
  dts: false,
  sourcemap: true,
  clean: true,
  minify: false,
  // Bundle ALL dependencies for self-contained server
  noExternal: [/.*/],
  platform: 'node',
  target: 'node18',
  splitting: false,
  treeshake: true,
})
