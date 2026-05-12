import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = __dirname;
const monorepoRoot = path.resolve(webRoot, '../..');
const hasMonorepoShared = path.basename(webRoot) === 'web' && path.basename(path.dirname(webRoot)) === 'apps';
const projectRoot = hasMonorepoShared ? monorepoRoot : webRoot;
const alias = {
  '@app': path.resolve(webRoot, './src/app'),
  '@features': path.resolve(webRoot, './src/features'),
  '@core': path.resolve(webRoot, './src/core'),
  '@domain': path.resolve(webRoot, './src/domain'),
  '@infra': path.resolve(webRoot, './src/infra'),
  ...(hasMonorepoShared
    ? {
        '@audidisc/shared': path.resolve(monorepoRoot, './packages/shared/src/index.ts'),
      }
    : {}),
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
