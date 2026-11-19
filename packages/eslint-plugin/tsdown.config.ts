import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: { sourcemap: false },
  sourcemap: true,
  define: {
    PACKAGE_VERSION: JSON.stringify(pkg.version),
  },
})
