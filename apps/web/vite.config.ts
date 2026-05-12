import { existsSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = __dirname;
const monorepoRoot = path.resolve(webRoot, '../..');
const monorepoSharedEntry = path.resolve(monorepoRoot, './packages/shared/src/index.ts');
const localSharedEntry = path.resolve(webRoot, './src/shared/index.ts');
const hasMonorepoShared = existsSync(monorepoSharedEntry);
const projectRoot = hasMonorepoShared ? monorepoRoot : webRoot;
const alias = {
  '@app': path.resolve(webRoot, './src/app'),
  '@features': path.resolve(webRoot, './src/features'),
  '@core': path.resolve(webRoot, './src/core'),
  '@domain': path.resolve(webRoot, './src/domain'),
  '@infra': path.resolve(webRoot, './src/infra'),
  '@audidisc/shared': hasMonorepoShared ? monorepoSharedEntry : localSharedEntry,
};

export default defineConfig({
  root: webRoot,
  envDir: webRoot,
  cacheDir: path.resolve(projectRoot, 'node_modules/.vite/apps-web'),
  plugins: [react()],
  build: {
    cssCodeSplit: true,
    outDir: path.resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth'],
          vendor: ['react', 'react-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  resolve: {
    alias,
  },
  server: {
    fs: {
      allow: [webRoot, projectRoot],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
