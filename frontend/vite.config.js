import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'process', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
        process: true
      }
    }),
    react()
  ],
  resolve: {
    alias: {
      buffer: resolve(__dirname, 'node_modules/buffer/index.js'),
      process: resolve(__dirname, 'node_modules/process/browser.js'),
      'process/': resolve(__dirname, 'node_modules/process/browser.js')
    }
  },
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  optimizeDeps: {
    include: ['buffer', 'process']
  }
});
