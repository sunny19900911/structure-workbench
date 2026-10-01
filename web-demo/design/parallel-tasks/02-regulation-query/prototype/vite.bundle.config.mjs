import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: resolve(currentDir, 'generated'),
    lib: {
      entry: resolve(currentDir, 'app.mjs'),
      name: 'RegulationQueryDemo',
      formats: ['iife'],
      fileName: () => 'app.bundle.js',
    },
    minify: false,
    sourcemap: false,
  },
});
