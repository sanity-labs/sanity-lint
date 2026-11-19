import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    fragments: 'src/fragments/index.ts',
    functions: 'src/functions.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: { sourcemap: false },
  sourcemap: true,
})
