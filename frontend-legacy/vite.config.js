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
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js'
    ]
  },
  build: {
    // Maps are generated (for error-reporting uploads) but not referenced from the bundles.
    // `postbuild` in package.json deletes dist/**/*.map so they are not deployed publicly.
    sourcemap: 'hidden',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    chunkSizeWarningLimit: 5000
  }
});
