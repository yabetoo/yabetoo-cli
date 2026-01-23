import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/bin/yabetoo.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: true,
  minify: false,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
