import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    target: 'safari15',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { host: true },
});
