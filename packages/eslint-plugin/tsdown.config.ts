import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'

const pkg: unknown = JSON.parse(readFileSync('./package.json', 'utf8'))
const version =
  typeof pkg === 'object' && pkg !== null && 'version' in pkg ? pkg.version : undefined

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: { sourcemap: false },
  sourcemap: true,
  define: {
    PACKAGE_VERSION: JSON.stringify(version),
  },
})
