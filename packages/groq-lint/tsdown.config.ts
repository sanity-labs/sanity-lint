import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/schema.ts'],
    format: 'esm',
    fixedExtension: false,
    dts: { sourcemap: false },
    sourcemap: true,
  },
  // CLI (ESM only - uses import.meta.url)
  {
    entry: ['src/cli.ts'],
    format: 'esm',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
  },
])
