import { existsSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const catalogRoot = __dirname;
const monorepoRoot = path.resolve(catalogRoot, '../..');
const sharedEntry = path.resolve(monorepoRoot, './packages/shared/src/index.ts');

export default defineConfig({
  root: catalogRoot,
  envDir: catalogRoot,
  cacheDir: path.resolve(monorepoRoot, 'node_modules/.vite/apps-catalog'),
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    assetsInlineLimit: 2048,
    outDir: path.resolve(catalogRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          router: ['react-router-dom'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
          seo: ['react-helmet-async'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@audidisc/shared': existsSync(sharedEntry) ? sharedEntry : '@audidisc/shared',
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [catalogRoot, monorepoRoot],
    },
  },
});
