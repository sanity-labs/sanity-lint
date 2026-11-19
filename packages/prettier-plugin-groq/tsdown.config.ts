import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/embed.ts'],
  format: 'esm',
  fixedExtension: false,
  dts: { sourcemap: false },
  sourcemap: true,
})
