import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Don't bundle dependencies or node built-ins
  external: ['@sanity/lint-core', 'node:module', 'node:url', 'node:path', 'node:fs'],
})
