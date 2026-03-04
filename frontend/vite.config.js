import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins: [
    nodePolyfills(),
    react()
  ],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  define: {
    global: 'globalThis'
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'vendor-three';
            if (id.includes('@react-three')) return 'vendor-three-react';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('@solana') || id.includes('@walletconnect')) return 'vendor-wallets';
            if (id.includes('wagmi') || id.includes('viem')) return 'vendor-web3-core';
            return 'vendor';
          }
        }
      }
    }
  }
});
