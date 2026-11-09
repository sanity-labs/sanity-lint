import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/index.browser.ts', 'src/index.lazy.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['node:fs', 'node:url'],
})
