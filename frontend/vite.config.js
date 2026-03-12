// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),

    react()
  ],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: [
      'buffer',
      'process',
      'util',
      'stream',
      'events',
      'safe-buffer',
      '@solana/web3.js'
    ]
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
            if (id.includes('@account-kit') || id.includes('alchemy')) return 'vendor-alchemy';
            if (id.includes('@rainbow-me')) return 'vendor-rainbow';
            if (id.includes('ethers')) return 'vendor-ethers';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('recharts') || id.includes('d3') || id.includes('topojson')) return 'vendor-charts';
            if (id.includes('react-globe.gl') || id.includes('react-svg-worldmap')) return 'vendor-maps';
            if (id.includes('@privy-io')) return 'vendor-privy';
            return 'vendor';
          }
        }
      }
    }
  }
});
