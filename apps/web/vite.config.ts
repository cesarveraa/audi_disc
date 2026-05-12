import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = __dirname;
const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  root: webRoot,
  envDir: webRoot,
  cacheDir: path.resolve(monorepoRoot, 'node_modules/.vite/apps-web'),
  plugins: [react()],
  build: {
    cssCodeSplit: true,
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
    alias: {
      '@app': path.resolve(__dirname, './src/app'),
      '@features': path.resolve(__dirname, './src/features'),
      '@core': path.resolve(__dirname, './src/core'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@infra': path.resolve(__dirname, './src/infra'),
    },
  },
  server: {
    fs: {
      allow: [webRoot, monorepoRoot],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
