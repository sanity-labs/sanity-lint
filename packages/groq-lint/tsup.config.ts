import { defineConfig } from 'tsup'

export default defineConfig([
  // Library exports (ESM + CJS)
  {
    entry: ['src/index.ts', 'src/schema.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  // CLI (ESM only - uses import.meta.url)
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
  },
])
