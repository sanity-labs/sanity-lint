import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  outDir: 'dist',
  dts: false, // VS Code extensions don't need .d.ts files
  sourcemap: true,
  clean: true,
  minify: false, // Keep readable for debugging
  external: ['vscode'], // VS Code API is provided by the runtime
  noExternal: [
    // Bundle these dependencies
    '@sanity/client',
    'groq-js',
    'line-number',
    'osenv',
    'react',
    'react-dom',
    'react-jason',
    'ts-node',
    'vscode-languageclient',
    'xdg-basedir',
  ],
  platform: 'node',
  target: 'node18',
  // Don't split chunks for extension
  splitting: false,
  // Tree shake unused code
  treeshake: true,
  // Handle JSX
  esbuildOptions(options) {
    options.jsx = 'transform'
    options.jsxFactory = 'React.createElement'
    options.jsxFragment = 'React.Fragment'
  },
})
