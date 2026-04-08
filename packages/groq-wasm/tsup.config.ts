import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Don't bundle dependencies or Node built-ins (dynamically imported for file:// URL loading)
  external: ['@sanity/lint-core', 'node:fs/promises', 'node:url'],
})
