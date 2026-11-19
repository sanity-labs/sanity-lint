import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/index.browser.ts', 'src/index.lazy.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: { sourcemap: false },
  sourcemap: true,
  deps: {
    neverBundle: ['node:fs', 'node:url'],
  },
})
