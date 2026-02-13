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
    dedupe: ['react', 'react-dom'],
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
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;

          // Keep framework/runtime code in a small, stable base chunk.
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/@tanstack/react-query/')
          ) {
            return 'react-vendor';
          }

          // Keep wagmi + viem together to avoid circular chunks.
          if (
            id.includes('/wagmi/') ||
            id.includes('/viem/')
          ) {
            return 'evm-core';
          }

          if (id.includes('/@rainbow-me/')) return 'rainbowkit-vendor';
          if (id.includes('/@walletconnect/')) return 'walletconnect-vendor';
          if (id.includes('/@coinbase/')) return 'coinbase-vendor';
          if (id.includes('/@metamask/')) return 'metamask-vendor';
          if (id.includes('/@safe-global/')) return 'safe-vendor';

          if (
            id.includes('/three/') ||
            id.includes('/@react-three/fiber/') ||
            id.includes('/@react-three/drei/')
          ) {
            return 'three-vendor';
          }

          if (
            id.includes('/@solana/') ||
            id.includes('/@streamflow/')
          ) {
            return 'solana-vendor';
          }

          if (id.includes('/framer-motion/')) {
            return 'motion-vendor';
          }

        }
      }
    }
  }
});
